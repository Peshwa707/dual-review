import { describe, expect, test } from "bun:test";
import { CrossVendorError, runPipeline } from "../src/pipeline";
import { echoAdapter } from "../src/adapters/echo";
import type { PipelineConfig, Task } from "../src/types";

const adapters = {
  claude: echoAdapter("claude"),
  codex: echoAdapter("codex"),
};

const passTask: Task = {
  id: "toy-pass",
  prompt: "print hello",
  verify: { command: "echo hello", expect: "hello" },
};

describe("runPipeline v0", () => {
  test("passes when review approves and runtime gate matches", async () => {
    const config: PipelineConfig = { implementer: "claude", reviewer: "codex" };
    const v = await runPipeline(passTask, config, adapters);
    expect(v.passed).toBe(true);
    expect(v.review.approved).toBe(true);
    expect(v.gates[0]?.status).toBe("pass");
  });

  test("fails when the runtime expectation is not met", async () => {
    const config: PipelineConfig = { implementer: "claude", reviewer: "codex" };
    const failTask: Task = {
      id: "toy-fail",
      prompt: "x",
      verify: { command: "echo goodbye", expect: "hello" },
    };
    const v = await runPipeline(failTask, config, adapters);
    expect(v.passed).toBe(false);
    expect(v.gates[0]?.status).toBe("fail");
  });

  test("rejects same-vendor implementer and reviewer (cross-vendor invariant)", async () => {
    const config: PipelineConfig = { implementer: "claude", reviewer: "claude" };
    await expect(runPipeline(passTask, config, adapters)).rejects.toBeInstanceOf(CrossVendorError);
  });
});
