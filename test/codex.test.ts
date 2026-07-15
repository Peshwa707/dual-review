import { describe, expect, test } from "bun:test";
import { codexAdapter, defaultCodexRunner } from "../src/adapters/codex";
import type { CodexRun, CodexRunner } from "../src/adapters/codex";
import type { BoundedResult, Spawner } from "../src/spawn";
import type { Task } from "../src/types";

const task: Task = { id: "t", prompt: "add two numbers", verify: { command: "echo ok", expect: "ok" } };
const fakeRunner = (result: CodexRun): CodexRunner => async () => result;

describe("codexAdapter (hermetic — injected runner)", () => {
  test("implement returns the runner's final message as artifact content", async () => {
    const a = codexAdapter({ run: fakeRunner({ ok: true, lastMessage: "const f = () => 42;" }) });
    const art = await a.implement(task);
    expect(art.by).toBe("codex");
    expect(art.mock).toBeUndefined(); // real adapter output is not mock-flagged
    expect(art.content).toBe("const f = () => 42;");
  });

  test("implement throws when the runner fails", async () => {
    const a = codexAdapter({ run: fakeRunner({ ok: false, lastMessage: "", error: "boom" }) });
    await expect(a.implement(task)).rejects.toThrow(/codex implement failed/);
  });

  test("review parses a structured JSON verdict", async () => {
    const a = codexAdapter({ run: fakeRunner({ ok: true, lastMessage: '{"approved":true,"notes":"lgtm"}' }) });
    const r = await a.review(task, { by: "codex", content: "x" });
    expect(r.approved).toBe(true);
    expect(r.notes).toBe("lgtm");
  });

  test("review fails CLOSED on unparseable output", async () => {
    const a = codexAdapter({ run: fakeRunner({ ok: true, lastMessage: "totally not json" }) });
    const r = await a.review(task, { by: "codex", content: "x" });
    expect(r.approved).toBe(false);
  });

  test("review fails CLOSED when the runner errors", async () => {
    const a = codexAdapter({ run: fakeRunner({ ok: false, lastMessage: "", error: "timeout" }) });
    const r = await a.review(task, { by: "codex", content: "x" });
    expect(r.approved).toBe(false);
    expect(r.notes).toContain("codex review failed");
  });
});

describe("defaultCodexRunner (hermetic — injected spawn + readOutput)", () => {
  const spawnReturning = (res: BoundedResult): Spawner => async () => res;
  const ok: BoundedResult = { exitCode: 0, stdout: "", stderr: "", timedOut: false };

  test("ok when exit 0 and the output file is non-empty", async () => {
    const run = defaultCodexRunner({ spawn: spawnReturning(ok), readOutput: async () => "answer" });
    expect(await run("p", {})).toEqual({ ok: true, lastMessage: "answer" });
  });

  test("fails on timeout", async () => {
    const run = defaultCodexRunner({ spawn: spawnReturning({ ...ok, timedOut: true }), readOutput: async () => "x" });
    const r = await run("p", {});
    expect(r.ok).toBe(false);
    expect(r.error).toContain("timed out");
  });

  test("fails on non-zero exit", async () => {
    const run = defaultCodexRunner({ spawn: spawnReturning({ ...ok, exitCode: 1, stderr: "boom" }), readOutput: async () => "x" });
    const r = await run("p", {});
    expect(r.ok).toBe(false);
    expect(r.error).toContain("exited 1");
  });

  test("fails when the output file is empty/whitespace", async () => {
    const run = defaultCodexRunner({ spawn: spawnReturning(ok), readOutput: async () => "   " });
    const r = await run("p", {});
    expect(r.ok).toBe(false);
    expect(r.error).toContain("no output");
  });

  test("passes the prompt via stdin (not argv)", async () => {
    let seenArgv: string[] | undefined;
    let seenStdin: string | undefined;
    const spy: Spawner = async (argv, o) => {
      seenArgv = argv;
      seenStdin = o.stdin;
      return ok;
    };
    await defaultCodexRunner({ spawn: spy, readOutput: async () => "x" })("MY-PROMPT", {});
    expect(seenArgv).toContain("exec");
    expect(seenArgv).not.toContain("MY-PROMPT"); // prompt is NOT in argv
    expect(seenStdin).toBe("MY-PROMPT"); // prompt is on stdin
  });
});

// Live test — only runs with DR_LIVE=1 and a working, authed `codex` CLI.
const liveDescribe = process.env.DR_LIVE ? describe : describe.skip;
liveDescribe("codexAdapter (live codex exec)", () => {
  test("real codex implements a trivial task", async () => {
    const a = codexAdapter();
    const art = await a.implement({
      id: "live",
      prompt: "write a one-line TypeScript function named answer that returns 42",
      verify: { command: "echo ok", expect: "ok" },
    });
    expect(art.by).toBe("codex");
    expect(art.content.length).toBeGreaterThan(0);
  }, 130_000);
});
