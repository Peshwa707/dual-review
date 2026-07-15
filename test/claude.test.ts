import { describe, expect, test } from "bun:test";
import { claudeAdapter, defaultClaudeRunner } from "../src/adapters/claude";
import type { ClaudeRun, ClaudeRunner } from "../src/adapters/claude";
import type { BoundedResult, Spawner } from "../src/spawn";
import type { Task } from "../src/types";

const task: Task = { id: "t", prompt: "reverse a string", verify: { command: "echo ok", expect: "ok" } };
const fakeRunner = (r: ClaudeRun): ClaudeRunner => async () => r;

describe("claudeAdapter (hermetic — injected runner)", () => {
  test("implement returns text as artifact content", async () => {
    const a = claudeAdapter({ run: fakeRunner({ ok: true, text: "export const f = 1;" }) });
    const art = await a.implement(task);
    expect(art.by).toBe("claude");
    expect(art.mock).toBeUndefined();
    expect(art.content).toBe("export const f = 1;");
  });

  test("implement throws on runner failure", async () => {
    const a = claudeAdapter({ run: fakeRunner({ ok: false, text: "", error: "boom" }) });
    await expect(a.implement(task)).rejects.toThrow(/claude implement failed/);
  });

  test("review parses a structured JSON verdict", async () => {
    const a = claudeAdapter({ run: fakeRunner({ ok: true, text: '{"approved":true,"notes":"ok"}' }) });
    expect((await a.review(task, { by: "claude", content: "x" })).approved).toBe(true);
  });

  test("review fails CLOSED on garbage", async () => {
    const a = claudeAdapter({ run: fakeRunner({ ok: true, text: "not json" }) });
    expect((await a.review(task, { by: "claude", content: "x" })).approved).toBe(false);
  });

  test("review fails CLOSED when the runner errors", async () => {
    const a = claudeAdapter({ run: fakeRunner({ ok: false, text: "", error: "timeout" }) });
    const r = await a.review(task, { by: "claude", content: "x" });
    expect(r.approved).toBe(false);
    expect(r.notes).toContain("claude review failed");
  });
});

describe("defaultClaudeRunner (hermetic — injected spawn)", () => {
  const spawnReturning = (res: BoundedResult): Spawner => async () => res;
  const ok: BoundedResult = { exitCode: 0, stdout: "hello", stderr: "", timedOut: false };

  test("ok when exit 0 and stdout is non-empty", async () => {
    const run = defaultClaudeRunner({ spawn: spawnReturning(ok) });
    expect(await run("p", {})).toEqual({ ok: true, text: "hello" });
  });

  test("fails on timeout", async () => {
    const run = defaultClaudeRunner({ spawn: spawnReturning({ ...ok, timedOut: true }) });
    expect((await run("p", {})).error).toContain("timed out");
  });

  test("fails on non-zero exit", async () => {
    const run = defaultClaudeRunner({ spawn: spawnReturning({ ...ok, exitCode: 1, stderr: "boom" }) });
    expect((await run("p", {})).error).toContain("exited 1");
  });

  test("fails on empty stdout", async () => {
    const run = defaultClaudeRunner({ spawn: spawnReturning({ ...ok, stdout: "   " }) });
    expect((await run("p", {})).error).toContain("no output");
  });

  test("clears CLAUDECODE from the child env", async () => {
    let seenEnv: Record<string, string | undefined> | undefined;
    const spy: Spawner = async (_argv, o) => {
      seenEnv = o.env;
      return ok;
    };
    await defaultClaudeRunner({ spawn: spy })("p", {});
    expect(seenEnv !== undefined && "CLAUDECODE" in seenEnv).toBe(false);
  });
});
