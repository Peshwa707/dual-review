import { describe, expect, test } from "bun:test";
import { runPipeline } from "../src/pipeline";
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
});
