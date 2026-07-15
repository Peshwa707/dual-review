import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnBounded, type Spawner } from "../spawn";
import type { Adapter } from "./types";
import type { Artifact, ReviewResult, Task } from "../types";

const REVIEW_SCHEMA_PATH = join(import.meta.dir, "review.schema.json");
const DEFAULT_TIMEOUT_MS = 120_000;

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
 * runs read-only, and reads the agent's final message from the `-o` output file.
 * `spawn` and `readOutput` are injectable so the timeout/exit/empty-output branches are testable.
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
      const r = await spawn(["codex", ...args], { timeoutMs: runOpts.timeoutMs ?? DEFAULT_TIMEOUT_MS });
      if (r.timedOut) return { ok: false, lastMessage: "", error: "codex exec timed out" };
      if (r.exitCode !== 0) {
        return { ok: false, lastMessage: "", error: `codex exec exited ${r.exitCode}: ${r.stderr.slice(0, 500)}` };
      }
      const lastMessage = (await readOutput(outFile)).trim();
      if (!lastMessage) return { ok: false, lastMessage: "", error: "codex exec produced no output" };
      return { ok: true, lastMessage };
    } finally {
      await unlink(outFile).catch(() => {});
    }
  };
}

/** Strip a ```json ... ``` fence if the model wrapped its JSON. Returns the first fenced block. */
function stripFences(s: string): string {
  const m = s.trim().match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m && m[1] ? m[1] : s).trim();
}

/** Parse a review verdict; fail CLOSED (approved: false) on anything unparseable or wrong-typed. */
export function parseReview(raw: string): { approved: boolean; notes: string } {
  try {
    const obj = JSON.parse(stripFences(raw)) as { approved?: unknown; notes?: unknown };
    if (typeof obj.approved === "boolean") {
      return { approved: obj.approved, notes: typeof obj.notes === "string" ? obj.notes : "" };
    }
  } catch {
    // fall through to fail-closed
  }
  return { approved: false, notes: `unparseable review output: ${raw.slice(0, 200)}` };
}

/**
 * Real Codex adapter (v1.0). Implements by asking Codex for code-as-text; reviews by
 * asking for a structured {approved, notes} verdict constrained to a JSON schema.
 *
 * NOTE: the reviewer prompt interpolates model-generated `artifact.content`, so a
 * schema-valid but adversarial `{"approved":true}` can be induced (prompt injection).
 * The schema + fail-closed parsing defend against malformed output, not against a model
 * that is successfully convinced — hardening this is tracked for a later slice.
 *
 * Pass a fake `run` to unit-test the logic without invoking the CLI.
 */
export function codexAdapter(opts: { run?: CodexRunner; model?: string } = {}): Adapter {
  const run = opts.run ?? defaultCodexRunner({ model: opts.model });
  return {
    vendor: "codex",
    async implement(task: Task): Promise<Artifact> {
      const prompt =
        `Implement this coding task. Return ONLY the code — no explanation, no markdown fences.\n\n` +
        `Task: ${task.prompt}`;
      const r = await run(prompt, { timeoutMs: DEFAULT_TIMEOUT_MS });
      if (!r.ok) throw new Error(`codex implement failed: ${r.error ?? "unknown error"}`);
      return { by: "codex", content: r.lastMessage };
    },
    async review(task: Task, artifact: Artifact): Promise<ReviewResult> {
      const prompt =
        `Review the artifact below against the task: "${task.prompt}".\n` +
        `Respond ONLY with JSON of the form {"approved": boolean, "notes": string}. ` +
        `Approve only if the artifact correctly and safely addresses the task.\n\n` +
        `Artifact:\n${artifact.content}`;
      const r = await run(prompt, { schemaPath: REVIEW_SCHEMA_PATH, timeoutMs: DEFAULT_TIMEOUT_MS });
      if (!r.ok) return { by: "codex", approved: false, notes: `codex review failed: ${r.error ?? "unknown error"}` };
      return { by: "codex", ...parseReview(r.lastMessage) };
    },
  };
}
