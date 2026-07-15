import { describe, expect, test } from "bun:test";
import { CrossVendorError, runPipeline } from "../src/pipeline";
import { echoAdapter } from "../src/adapters/echo";
import type { Adapter } from "../src/adapters/types";
import type { PipelineConfig, Task, Vendor } from "../src/types";

const adapters = {
  claude: echoAdapter("claude"),
  codex: echoAdapter("codex"),
};

const passTask: Task = {
  id: "toy-pass",
  prompt: "print hello",
  verify: { command: "echo hello", expect: "hello" },
};

/** Adapter that implements like echo but always disapproves in review. */
function rejectingAdapter(vendor: Vendor): Adapter {
  return {
    vendor,
    async implement(task) {
      return { by: vendor, content: `// ${task.id}\n` };
    },
    async review() {
      return { by: vendor, approved: false, notes: "rejected" };
    },
  };
}

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

  test("when the reviewer rejects, no gates run and the verdict fails", async () => {
    const config: PipelineConfig = { implementer: "claude", reviewer: "codex" };
    const v = await runPipeline(passTask, config, {
      claude: echoAdapter("claude"),
      codex: rejectingAdapter("codex"),
    });
    expect(v.review.approved).toBe(false);
    expect(v.gates).toHaveLength(0);
    expect(v.passed).toBe(false);
  });

  test("rejects same config key for implementer and reviewer", async () => {
    const config: PipelineConfig = { implementer: "claude", reviewer: "claude" };
    await expect(runPipeline(passTask, config, adapters)).rejects.toBeInstanceOf(CrossVendorError);
  });

  test("rejects an adapter whose real vendor differs from its config key", async () => {
    // codex adapter mis-registered under the "claude" key — must NOT pass as cross-vendor.
    const config: PipelineConfig = { implementer: "claude", reviewer: "codex" };
    const sneaky = { claude: echoAdapter("codex"), codex: echoAdapter("codex") };
    await expect(runPipeline(passTask, config, sneaky)).rejects.toBeInstanceOf(CrossVendorError);
  });

  test("throws when an adapter is missing", async () => {
    const config: PipelineConfig = { implementer: "claude", reviewer: "kimi" };
    await expect(runPipeline(passTask, config, adapters)).rejects.toThrow(/no adapter registered/);
  });
});
