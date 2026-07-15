import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allowlistedEnv, spawnBounded, type Spawner } from "../spawn";
import { parseReview } from "./parse";
import { AGENT_TIMEOUT_MS, buildImplementPrompt, buildReviewPrompt } from "./shared";
import type { Adapter } from "./types";
import type { Artifact, ReviewResult, Task } from "../types";

const REVIEW_SCHEMA_PATH = join(import.meta.dir, "review.schema.json");
const CODEX_ENV_PASSTHROUGH = ["OPENAI_API_KEY", "CODEX_HOME"];

/** Result of one `codex exec` invocation (the agent's final message). */
export interface CodexRun {
  ok: boolean;
  lastMessage: string;
  error?: string;
}

/** Executes a single Codex call. Injectable so the adapter's logic is testable without the CLI. */
export interface CodexRunner {
  (prompt: string, opts: { schemaPath?: string; timeoutMs?: number }): Promise<CodexRun>;
}

let tmpCounter = 0;
function tmpOut(): string {
  return join(tmpdir(), `dual-review-codex-${process.pid}-${tmpCounter++}.out`);
}

/**
 * Default runner: shells to `codex exec` via an argv array (no shell interpolation),
 * runs read-only under a least-privilege env, and reads the agent's final message from
 * the `-o` output file. `spawn`/`readOutput` are injectable for hermetic testing.
 */
export function defaultCodexRunner(
  opts: { model?: string; spawn?: Spawner; readOutput?: (path: string) => Promise<string> } = {},
): CodexRunner {
  const spawn = opts.spawn ?? spawnBounded;
  const readOutput = opts.readOutput ?? ((p) => Bun.file(p).text().catch(() => ""));

  return async (prompt, runOpts) => {
    const outFile = tmpOut();
    const args = ["exec", "-s", "read-only", "--skip-git-repo-check", "-o", outFile];
    if (opts.model) args.push("-m", opts.model);
    if (runOpts.schemaPath) args.push("--output-schema", runOpts.schemaPath);
    args.push(prompt);

    try {
      const r = await spawn(["codex", ...args], {
        timeoutMs: runOpts.timeoutMs ?? AGENT_TIMEOUT_MS,
        env: allowlistedEnv(CODEX_ENV_PASSTHROUGH),
      });
      if (r.timedOut) return { ok: false, lastMessage: "", error: "codex exec timed out" };
      if (r.exitCode !== 0) {
        return { ok: false, lastMessage: "", error: `codex exec exited ${r.exitCode}: ${r.stderr.slice(0, 500)}` };
      }
      const lastMessage = (await readOutput(outFile)).trim();
      if (!lastMessage) return { ok: false, lastMessage: "", error: "codex exec produced no output" };
      return { ok: true, lastMessage };
    } catch (err) {
      return { ok: false, lastMessage: "", error: `codex spawn failed: ${err instanceof Error ? err.message : String(err)}` };
    } finally {
      await unlink(outFile).catch(() => {});
    }
  };
}

/**
 * Real Codex adapter (v1.0). Implements by asking Codex for code-as-text; reviews by
 * asking for a schema-constrained {approved, notes} verdict, parsed fail-closed.
 *
 * NOTE: the reviewer prompt interpolates model-generated `artifact.content`, so a
 * schema-valid but adversarial `{"approved":true}` can be induced (prompt injection).
 * The schema + fail-closed parsing defend against malformed output, not against a model
 * that is successfully convinced — hardening that is tracked for a later slice.
 */
export function codexAdapter(opts: { run?: CodexRunner; model?: string } = {}): Adapter {
  const run = opts.run ?? defaultCodexRunner({ model: opts.model });
  return {
    vendor: "codex",
    async implement(task: Task): Promise<Artifact> {
      const r = await run(buildImplementPrompt(task), { timeoutMs: AGENT_TIMEOUT_MS });
      if (!r.ok) throw new Error(`codex implement failed: ${r.error ?? "unknown error"}`);
      return { by: "codex", content: r.lastMessage };
    },
    async review(task: Task, artifact: Artifact): Promise<ReviewResult> {
      try {
        const r = await run(buildReviewPrompt(task, artifact), {
          schemaPath: REVIEW_SCHEMA_PATH,
          timeoutMs: AGENT_TIMEOUT_MS,
        });
        if (!r.ok) return { by: "codex", approved: false, notes: `codex review failed: ${r.error ?? "unknown error"}` };
        return { by: "codex", ...parseReview(r.lastMessage) };
      } catch (err) {
        return { by: "codex", approved: false, notes: `codex review error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
}
