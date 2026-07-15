import { allowlistedEnv, spawnBounded, type SpawnOpts } from "../spawn";
import type { GateResult, Task } from "../types";
import type { Gate } from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Runtime-verification gate — the non-negotiable one.
 * Runs the task's verify command (bounded by timeout + capped output) and asserts the
 * expected substring appears in output AND exit code is 0. Typecheck/build passing is
 * never accepted as proof.
 *
 * `command` as a string runs via `sh -c` (operator-authored specs); as a string[] it runs
 * as a raw argv with no shell — the safe form for less-trusted specs. `env: "clean"` runs
 * under a least-privilege environment.
 */
export async function runtimeGate(task: Task): Promise<GateResult> {
  const { command, expect, timeoutMs = DEFAULT_TIMEOUT_MS, env } = task.verify;
  const argv = Array.isArray(command) ? command : ["sh", "-c", command];
  const opts: SpawnOpts = { timeoutMs };
  if (env === "clean") opts.env = allowlistedEnv();

  const r = await spawnBounded(argv, opts);

  if (r.timedOut) {
    return {
      gate: "runtime",
      status: "fail",
      evidence: `timed out after ${timeoutMs}ms: ${JSON.stringify(command)}`,
    };
  }

  const combined = r.stdout + r.stderr;
  const found = combined.includes(expect);
  const ok = r.exitCode === 0 && found;
  const shell = !Array.isArray(command);
  return {
    gate: "runtime",
    status: ok ? "pass" : "fail",
    evidence: `exit=${r.exitCode} expect=${JSON.stringify(expect)} found=${found} shell=${shell} env=${env ?? "inherit"}`,
  };
}

/** The runtime gate as a registered Gate (the pipeline's default). */
export const runtimeGateDef: Gate = { name: "runtime", run: runtimeGate };
