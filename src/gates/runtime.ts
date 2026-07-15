import { spawnBounded } from "../spawn";
import type { GateResult, Task } from "../types";

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Runtime-verification gate — the non-negotiable one.
 * Runs the task's verify command (bounded by timeout + capped output) and asserts the
 * expected substring appears in output AND exit code is 0. Typecheck/build passing is
 * never accepted as proof.
 */
export async function runtimeGate(task: Task): Promise<GateResult> {
  const timeoutMs = task.verify.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const r = await spawnBounded(["sh", "-c", task.verify.command], { timeoutMs });

  if (r.timedOut) {
    return {
      gate: "runtime",
      status: "fail",
      evidence: `timed out after ${timeoutMs}ms: ${JSON.stringify(task.verify.command)}`,
    };
  }

  const combined = r.stdout + r.stderr;
  const found = combined.includes(task.verify.expect);
  const ok = r.exitCode === 0 && found;
  return {
    gate: "runtime",
    status: ok ? "pass" : "fail",
    evidence: `exit=${r.exitCode} expect=${JSON.stringify(task.verify.expect)} found=${found}`,
  };
}
