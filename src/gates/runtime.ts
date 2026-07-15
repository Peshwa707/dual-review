import type { GateResult, Task } from "../types";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 1_000_000;

/** Read a stream to completion but only retain up to MAX_OUTPUT_BYTES (keeps draining so the pipe never blocks). */
async function readCapped(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let stored = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && stored < MAX_OUTPUT_BYTES) {
      chunks.push(value);
      stored += value.length;
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Runtime-verification gate — the non-negotiable one.
 * Runs the task's verify command under a wall-clock timeout and a capped output
 * buffer, then asserts the expected substring appears in output AND exit code is 0.
 * A build/typecheck passing is never accepted as proof.
 */
export async function runtimeGate(task: Task): Promise<GateResult> {
  const timeoutMs = task.verify.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const proc = Bun.spawn(["sh", "-c", task.verify.command], {
    stdout: "pipe",
    stderr: "pipe",
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);

  try {
    const [stdout, stderr] = await Promise.all([
      readCapped(proc.stdout),
      readCapped(proc.stderr),
    ]);
    await proc.exited;

    if (timedOut) {
      return {
        gate: "runtime",
        status: "fail",
        evidence: `timed out after ${timeoutMs}ms: ${JSON.stringify(task.verify.command)}`,
      };
    }

    const combined = stdout + stderr;
    const found = combined.includes(task.verify.expect);
    const ok = proc.exitCode === 0 && found;
    return {
      gate: "runtime",
      status: ok ? "pass" : "fail",
      evidence: `exit=${proc.exitCode} expect=${JSON.stringify(task.verify.expect)} found=${found}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
