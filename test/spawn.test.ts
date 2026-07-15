import { describe, expect, test } from "bun:test";
import { spawnBounded } from "../src/spawn";

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
});
