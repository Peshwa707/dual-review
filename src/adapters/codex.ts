import { tmpdir } from "node:os";
import { join } from "node:path";
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
 */
export function defaultCodexRunner(model?: string): CodexRunner {
  return async (prompt, opts) => {
    const outFile = tmpOut();
    const args = ["exec", "-s", "read-only", "--skip-git-repo-check", "-o", outFile];
    if (model) args.push("-m", model);
    if (opts.schemaPath) args.push("--output-schema", opts.schemaPath);
    args.push(prompt);

    const proc = Bun.spawn(["codex", ...args], { stdout: "pipe", stderr: "pipe" });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      // Drain both streams so the pipe never blocks; the final answer comes from the -o file.
      const [, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      await proc.exited;

      if (timedOut) return { ok: false, lastMessage: "", error: "codex exec timed out" };
      if (proc.exitCode !== 0) {
        return { ok: false, lastMessage: "", error: `codex exec exited ${proc.exitCode}: ${stderr.slice(0, 500)}` };
      }
      const lastMessage = (await Bun.file(outFile).text().catch(() => "")).trim();
      if (!lastMessage) return { ok: false, lastMessage: "", error: "codex exec produced no output" };
      return { ok: true, lastMessage };
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Strip a ```json ... ``` fence if the model wrapped its JSON. */
function stripFences(s: string): string {
  const m = s.trim().match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m && m[1] ? m[1] : s).trim();
}

/** Parse a review verdict; fail CLOSED (approved: false) on anything unparseable. */
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
 * Pass a fake `run` to unit-test the logic without invoking the CLI.
 */
export function codexAdapter(opts: { run?: CodexRunner; model?: string } = {}): Adapter {
  const run = opts.run ?? defaultCodexRunner(opts.model);
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
