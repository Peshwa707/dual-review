import { spawnBounded, type Spawner } from "../spawn";
import { parseReview } from "./parse";
import type { Adapter } from "./types";
import type { Artifact, ReviewResult, Task } from "../types";

const DEFAULT_TIMEOUT_MS = 120_000;

/** Result of one `claude -p` invocation (its printed text). */
export interface ClaudeRun {
  ok: boolean;
  text: string;
  error?: string;
}

/** Executes a single Claude call. Injectable so the adapter's logic is testable without the CLI. */
export interface ClaudeRunner {
  (prompt: string, opts: { timeoutMs?: number }): Promise<ClaudeRun>;
}

/**
 * Default runner: shells to `claude -p --output-format text` via an argv array (no shell
 * interpolation). Clears CLAUDECODE from the child env so the CLI isn't refused when
 * dual-review itself happens to run inside a Claude Code session.
 * `spawn` is injectable so the timeout/exit/empty-output branches are testable.
 */
export function defaultClaudeRunner(opts: { model?: string; spawn?: Spawner } = {}): ClaudeRunner {
  const spawn = opts.spawn ?? spawnBounded;
  return async (prompt, runOpts) => {
    const args = ["-p", "--output-format", "text"];
    if (opts.model) args.push("--model", opts.model);
    args.push(prompt);

    const env = { ...process.env };
    delete env.CLAUDECODE;

    const r = await spawn(["claude", ...args], { timeoutMs: runOpts.timeoutMs ?? DEFAULT_TIMEOUT_MS, env });
    if (r.timedOut) return { ok: false, text: "", error: "claude timed out" };
    if (r.exitCode !== 0) {
      return { ok: false, text: "", error: `claude exited ${r.exitCode}: ${r.stderr.slice(0, 500)}` };
    }
    const text = r.stdout.trim();
    if (!text) return { ok: false, text: "", error: "claude produced no output" };
    return { ok: true, text };
  };
}

/**
 * Real Claude adapter (v1.1). Implements by asking Claude for code-as-text; reviews by
 * asking for a JSON {approved, notes} verdict, parsed fail-closed (same parser as Codex).
 * Claude has no server-side output-schema flag, so the verdict shape is prompt-instructed
 * and the fail-closed parser is the guardrail.
 *
 * Pass a fake `run` to unit-test the logic without invoking the CLI.
 */
export function claudeAdapter(opts: { run?: ClaudeRunner; model?: string } = {}): Adapter {
  const run = opts.run ?? defaultClaudeRunner({ model: opts.model });
  return {
    vendor: "claude",
    async implement(task: Task): Promise<Artifact> {
      const prompt =
        `Implement this coding task. Return ONLY the code — no explanation, no markdown fences.\n\n` +
        `Task: ${task.prompt}`;
      const r = await run(prompt, { timeoutMs: DEFAULT_TIMEOUT_MS });
      if (!r.ok) throw new Error(`claude implement failed: ${r.error ?? "unknown error"}`);
      return { by: "claude", content: r.text };
    },
    async review(task: Task, artifact: Artifact): Promise<ReviewResult> {
      const prompt =
        `Review the artifact below against the task: "${task.prompt}".\n` +
        `Respond ONLY with JSON of the form {"approved": boolean, "notes": string}. ` +
        `Approve only if the artifact correctly and safely addresses the task.\n\n` +
        `Artifact:\n${artifact.content}`;
      const r = await run(prompt, { timeoutMs: DEFAULT_TIMEOUT_MS });
      if (!r.ok) return { by: "claude", approved: false, notes: `claude review failed: ${r.error ?? "unknown error"}` };
      return { by: "claude", ...parseReview(r.text) };
    },
  };
}
