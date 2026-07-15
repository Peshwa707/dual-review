import { describe, expect, test } from "bun:test";
import { allowlistedEnv, spawnBounded } from "../src/spawn";

describe("allowlistedEnv", () => {
  test("keeps PATH and explicit passthrough keys, drops everything else", () => {
    process.env.DR_TEST_SECRET = "shh";
    process.env.DR_TEST_ALLOWED = "ok";
    try {
      const env = allowlistedEnv(["DR_TEST_ALLOWED"]);
      expect(env.PATH).toBeDefined();
      expect(env.DR_TEST_ALLOWED).toBe("ok");
      expect("DR_TEST_SECRET" in env).toBe(false);
      expect("CLAUDECODE" in env).toBe(false);
    } finally {
      delete process.env.DR_TEST_SECRET;
      delete process.env.DR_TEST_ALLOWED;
    }
  });
});

describe("spawnBounded", () => {
  test("captures stdout and a zero exit code", async () => {
    const r = await spawnBounded(["sh", "-c", "echo hi"], { timeoutMs: 5000 });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("hi");
    expect(r.timedOut).toBe(false);
  });

  test("reports a non-zero exit code", async () => {
    const r = await spawnBounded(["sh", "-c", "exit 3"], { timeoutMs: 5000 });
    expect(r.exitCode).toBe(3);
    expect(r.timedOut).toBe(false);
  });

  test("times out a long-running command", async () => {
    const r = await spawnBounded(["sh", "-c", "sleep 5"], { timeoutMs: 150 });
    expect(r.timedOut).toBe(true);
  });

  test("feeds stdin to the child", async () => {
    const r = await spawnBounded(["cat"], { timeoutMs: 5000, stdin: "hello-stdin" });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("hello-stdin");
  });

  test("round-trips a multibyte (UTF-8) stdin payload exactly", async () => {
    const payload = "héllo 漢字 🚀 😀";
    const r = await spawnBounded(["cat"], { timeoutMs: 5000, stdin: payload });
    expect(r.stdout).toBe(payload);
  });

  test("handles a large (>1MB) stdin payload without deadlock, capping output", async () => {
    const payload = "x".repeat(1_500_000);
    const r = await spawnBounded(["cat"], { timeoutMs: 10000, stdin: payload });
    expect(r.timedOut).toBe(false);
    expect(r.stdout.length).toBe(1_000_000); // capped at MAX_OUTPUT_BYTES, no deadlock past the pipe buffer
  });

  test("escalates to SIGKILL when the child traps SIGTERM", async () => {
    // Busy-loop (no grandchild holding the pipe) so this isolates SIGKILL escalation from the
    // known/deferred orphan-process limitation. SIGTERM is trapped; SIGKILL fires after the grace.
    const r = await spawnBounded(["sh", "-c", "trap '' TERM; while :; do :; done"], { timeoutMs: 200 });
    expect(r.timedOut).toBe(true);
  }, 6000);
});
