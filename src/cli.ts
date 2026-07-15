#!/usr/bin/env bun
import { echoAdapter } from "./adapters/echo";
import { runPipeline } from "./pipeline";
import { assertTask } from "./task";
import type { PipelineConfig } from "./types";

async function main(): Promise<void> {
  const [cmd, taskPath] = process.argv.slice(2);
  if (cmd !== "run" || !taskPath) {
    console.error("usage: dual-review run <task.json>");
    process.exit(2);
  }

  const raw = await Bun.file(taskPath).json();
  assertTask(raw);
  const task = raw;

  // v0 wires echo adapters. Real vendor adapters (claude / codex / cursor / kimi) land in v1.
  const config: PipelineConfig = { implementer: "claude", reviewer: "codex" };
  const adapters = {
    claude: echoAdapter("claude"),
    codex: echoAdapter("codex"),
  };

  const verdict = await runPipeline(task, config, adapters);
  console.log(JSON.stringify(verdict, null, 2));
  console.log(verdict.passed ? "VERDICT: PASS" : "VERDICT: FAIL");
  process.exit(verdict.passed ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
