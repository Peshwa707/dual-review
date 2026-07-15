import { describe, expect, test } from "bun:test";
import { codexAdapter, parseReview } from "../src/adapters/codex";
import type { CodexRun, CodexRunner } from "../src/adapters/codex";
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

describe("parseReview", () => {
  test("strips a json code fence", () => {
    expect(parseReview('```json\n{"approved":false,"notes":"n"}\n```')).toEqual({ approved: false, notes: "n" });
  });
  test("fails closed on garbage", () => {
    expect(parseReview("nope").approved).toBe(false);
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
