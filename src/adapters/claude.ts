import { allowlistedEnv, spawnBounded, type Spawner } from "../spawn";
import { parseReview } from "./parse";
import { AGENT_TIMEOUT_MS, buildImplementPrompt, buildReviewPrompt } from "./shared";
import type { Adapter } from "./types";
import type { Artifact, ReviewResult, Task } from "../types";

const CLAUDE_ENV_PASSTHROUGH = ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_AUTH_TOKEN"];

// Code-as-text needs no tools. Deny-by-default beats a denylist: an EMPTY --allowedTools means no
// built-in tool is auto-permitted (and nothing is grantable in non-interactive -p), which also
// covers MCP (mcp__*) and any future tool a name-denylist would miss. --strict-mcp-config makes the
// child ignore the operator's ambient MCP servers otherwise loaded via inherited HOME.
// Best-available application-level restriction; the runtime denial in -p is not live-verified from a
// nested Claude Code session (see the deferred Claude live path).
const CLAUDE_TOOL_LOCK = ["--allowedTools", "", "--strict-mcp-config"];

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
 * interpolation), under a least-privilege env. CLAUDECODE is excluded by the allowlist,
 * so the CLI isn't refused when dual-review runs inside a Claude Code session.
 * `spawn` is injectable for hermetic testing.
 */
export function defaultClaudeRunner(opts: { model?: string; spawn?: Spawner } = {}): ClaudeRunner {
  const spawn = opts.spawn ?? spawnBounded;
  return async (prompt, runOpts) => {
    const args = ["-p", "--output-format", "text", ...CLAUDE_TOOL_LOCK];
    if (opts.model) args.push("--model", opts.model);
    // Prompt via stdin (no positional) so the variadic --allowedTools can't consume it.

    try {
      const r = await spawn(["claude", ...args], {
        timeoutMs: runOpts.timeoutMs ?? AGENT_TIMEOUT_MS,
        env: allowlistedEnv(CLAUDE_ENV_PASSTHROUGH),
        stdin: prompt,
      });
      if (r.timedOut) return { ok: false, text: "", error: "claude timed out" };
      if (r.exitCode !== 0) return { ok: false, text: "", error: `claude exited ${r.exitCode}: ${r.stderr.slice(0, 500)}` };
      const text = r.stdout.trim();
      if (!text) return { ok: false, text: "", error: "claude produced no output" };
      return { ok: true, text };
    } catch (err) {
      return { ok: false, text: "", error: `claude spawn failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  };
}

/**
 * Real Claude adapter (v1.1). Implements by asking Claude for code-as-text; reviews by
 * asking for a JSON {approved, notes} verdict, parsed fail-closed (same parser + prompts
 * as every other vendor). Claude has no server-side output-schema flag, so the fail-closed
 * parser is the guardrail.
 */
export function claudeAdapter(opts: { run?: ClaudeRunner; model?: string } = {}): Adapter {
  const run = opts.run ?? defaultClaudeRunner({ model: opts.model });
  return {
    vendor: "claude",
    async implement(task: Task): Promise<Artifact> {
      const r = await run(buildImplementPrompt(task), { timeoutMs: AGENT_TIMEOUT_MS });
      if (!r.ok) throw new Error(`claude implement failed: ${r.error ?? "unknown error"}`);
      return { by: "claude", content: r.text };
    },
    async review(task: Task, artifact: Artifact): Promise<ReviewResult> {
      try {
        const r = await run(buildReviewPrompt(task, artifact), { timeoutMs: AGENT_TIMEOUT_MS });
        if (!r.ok) return { by: "claude", approved: false, notes: `claude review failed: ${r.error ?? "unknown error"}` };
        return { by: "claude", ...parseReview(r.text) };
      } catch (err) {
        return { by: "claude", approved: false, notes: `claude review error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
}
