import type { GateResult, Task } from "../types";

/**
 * Runtime-verification gate — the non-negotiable one.
 * Actually runs the task's verify command and asserts the expected substring
 * appears in output. Never trusts typecheck/build success as proof.
 */
export async function runtimeGate(task: Task): Promise<GateResult> {
  const proc = Bun.spawn(["sh", "-c", task.verify.command], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  const combined = stdout + stderr;
  const found = combined.includes(task.verify.expect);
  const ok = proc.exitCode === 0 && found;

  return {
    gate: "runtime",
    status: ok ? "pass" : "fail",
    evidence: `exit=${proc.exitCode} expect=${JSON.stringify(task.verify.expect)} found=${found}`,
  };
}
