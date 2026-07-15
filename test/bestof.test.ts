import { describe, expect, test } from "bun:test";
import { runPipeline } from "../src/pipeline";
import { MAX_BEST_OF, normalizeBestOf, normalizeWinner } from "../src/bestof";
import { echoAdapter } from "../src/adapters/echo";
import type { Adapter } from "../src/adapters/types";
import type { PipelineConfig, Task } from "../src/types";

const config: PipelineConfig = { implementer: "claude", reviewer: "codex" };
const adapters = { claude: echoAdapter("claude"), codex: echoAdapter("codex") };
const task: Task = { id: "t", prompt: "p", verify: { command: "echo hi", expect: "hi" } };

describe("best-of-N", () => {
  test("generates N candidates; echo judge picks candidate 0; mockRun stays true", async () => {
    const v = await runPipeline(task, config, adapters, undefined, { bestOf: 3 });
    expect(v.candidates).toBe(3);
    expect(v.judge?.winner).toBe(0);
    expect(v.mockRun).toBe(true);
    expect(v.passed).toBe(true);
  });

  test("the judge's winner index selects the artifact", async () => {
    let n = 0;
    const impl: Adapter = {
      vendor: "claude",
      async implement() {
        return { by: "claude", content: `cand-${n++}` };
      },
      async review() {
        return { by: "claude", approved: true, notes: "" };
      },
    };
    const rev: Adapter = {
      vendor: "codex",
      async implement() {
        return { by: "codex", content: "x" };
      },
      async review() {
        return { by: "codex", approved: true, notes: "ok" };
      },
      async judge() {
        return { by: "codex", winner: 1, notes: "pick 1" };
      },
    };
    const v = await runPipeline(task, config, { claude: impl, codex: rev }, undefined, { bestOf: 3 });
    expect(v.candidates).toBe(3);
    expect(v.judge?.winner).toBe(1);
    expect(v.artifact.content).toBe("cand-1"); // the 2nd candidate
    expect(v.passed).toBe(true);
  });

  test("a throwing judge fails closed to candidate 0", async () => {
    const rev: Adapter = {
      vendor: "codex",
      async implement() {
        return { by: "codex", content: "x" };
      },
      async review() {
        return { by: "codex", approved: true, notes: "" };
      },
      async judge() {
        throw new Error("boom");
      },
    };
    const v = await runPipeline(task, config, { claude: echoAdapter("claude"), codex: rev }, undefined, { bestOf: 2 });
    expect(v.judge?.winner).toBe(0);
    expect(v.judge?.notes).toContain("judge threw");
  });

  test("a reviewer with no judge method picks candidate 0", async () => {
    const rev: Adapter = {
      vendor: "codex",
      async implement() {
        return { by: "codex", content: "x" };
      },
      async review() {
        return { by: "codex", approved: true, notes: "" };
      },
    };
    const v = await runPipeline(task, config, { claude: echoAdapter("claude"), codex: rev }, undefined, { bestOf: 2 });
    expect(v.candidates).toBe(2);
    expect(v.judge?.winner).toBe(0);
    expect(v.judge?.notes).toContain("no judge");
  });

  test("bestOf 1 (default) leaves candidates/judge unset", async () => {
    const v = await runPipeline(task, config, adapters);
    expect(v.candidates).toBeUndefined();
    expect(v.judge).toBeUndefined();
  });

  test("a non-integer in-range winner (0.5) fails closed to candidate 0 (no crash)", async () => {
    const rev: Adapter = {
      vendor: "codex",
      async implement() {
        return { by: "codex", content: "x" };
      },
      async review() {
        return { by: "codex", approved: true, notes: "" };
      },
      async judge() {
        return { by: "codex", winner: 0.5, notes: "bad index" };
      },
    };
    const v = await runPipeline(task, config, { claude: echoAdapter("claude"), codex: rev }, undefined, { bestOf: 2 });
    expect(v.judge?.winner).toBe(0); // coerced to a valid index
    expect(v.artifact).toBeDefined();
    expect(v.passed).toBe(true);
  });

  test("survives a partial candidate failure (judges the survivors)", async () => {
    let n = 0;
    const impl: Adapter = {
      vendor: "claude",
      async implement() {
        n += 1;
        if (n === 2) throw new Error("candidate 2 failed");
        return { by: "claude", content: `c${n}` };
      },
      async review() {
        return { by: "claude", approved: true, notes: "" };
      },
    };
    const v = await runPipeline(task, config, { claude: impl, codex: echoAdapter("codex") }, undefined, { bestOf: 3 });
    expect(v.candidates).toBe(2); // 2 of 3 survived
    expect(v.passed).toBe(true);
  });

  test("throws only when every candidate fails", async () => {
    const impl: Adapter = {
      vendor: "claude",
      async implement() {
        throw new Error("all fail");
      },
      async review() {
        return { by: "claude", approved: true, notes: "" };
      },
    };
    await expect(
      runPipeline(task, config, { claude: impl, codex: echoAdapter("codex") }, undefined, { bestOf: 2 }),
    ).rejects.toThrow(/all fail/);
  });

  test("stamps judge.by = reviewer vendor even if the judge lies", async () => {
    const rev: Adapter = {
      vendor: "codex",
      async implement() {
        return { by: "codex", content: "x" };
      },
      async review() {
        return { by: "codex", approved: true, notes: "" };
      },
      async judge() {
        return { by: "claude", winner: 0, notes: "" }; // lies about who judged
      },
    };
    const v = await runPipeline(task, config, { claude: echoAdapter("claude"), codex: rev }, undefined, { bestOf: 2 });
    expect(v.judge?.by).toBe("codex"); // not the lied "claude"
  });
});

describe("best-of-N normalizers", () => {
  test("normalizeBestOf clamps to [1, MAX_BEST_OF]", () => {
    expect(normalizeBestOf(NaN)).toBe(1);
    expect(normalizeBestOf(Infinity)).toBe(1);
    expect(normalizeBestOf(0)).toBe(1);
    expect(normalizeBestOf(1.5)).toBe(1);
    expect(normalizeBestOf(3)).toBe(3);
    expect(normalizeBestOf(1000)).toBe(MAX_BEST_OF);
  });
  test("normalizeWinner rejects out-of-range / non-integer to 0", () => {
    expect(normalizeWinner(1, 3)).toBe(1);
    expect(normalizeWinner(0.5, 3)).toBe(0);
    expect(normalizeWinner(5, 3)).toBe(0);
    expect(normalizeWinner(-1, 3)).toBe(0);
  });
});
