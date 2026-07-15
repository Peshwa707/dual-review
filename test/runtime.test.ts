import { describe, expect, test } from "bun:test";
import { runtimeGate } from "../src/gates/runtime";
import type { Task } from "../src/types";

const mk = (command: string, expect_: string, timeoutMs?: number): Task => ({
  id: "t",
  prompt: "p",
  verify: { command, expect: expect_, ...(timeoutMs ? { timeoutMs } : {}) },
});

describe("runtimeGate", () => {
  test("passes when the command exits 0 and output contains the expected substring", async () => {
    const g = await runtimeGate(mk("echo hello", "hello"));
    expect(g.status).toBe("pass");
  });

  test("fails when the command prints the token but exits non-zero", async () => {
    const g = await runtimeGate(mk("echo hello; exit 1", "hello"));
    expect(g.status).toBe("fail");
  });

  test("matches substrings printed to stderr", async () => {
    const g = await runtimeGate(mk("echo oops 1>&2", "oops"));
    expect(g.status).toBe("pass");
  });

  test("fails and reports a timeout when the command exceeds its wall-clock limit", async () => {
    const g = await runtimeGate(mk("sleep 5", "never", 150));
    expect(g.status).toBe("fail");
    expect(g.evidence).toContain("timed out");
  });
});
