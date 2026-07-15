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
});
