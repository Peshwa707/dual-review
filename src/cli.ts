#!/usr/bin/env bun
import { codexAdapter } from "./adapters/codex";
import { echoAdapter } from "./adapters/echo";
import { runPipeline } from "./pipeline";
import { assertTask } from "./task";
import type { PipelineConfig, Vendor } from "./types";

async function main(): Promise<void> {
  const [cmd, taskPath] = process.argv.slice(2);
  if (cmd !== "run" || !taskPath) {
    console.error("usage: dual-review run <task.json>");
    process.exit(2);
  }

  const raw = await Bun.file(taskPath).json();
  assertTask(raw);
  const task = raw;

  // Adapter registry. `codex` is the real adapter when DR_CODEX_LIVE is set, else a mock.
  // `claude` is still a mock until the v1.1 Claude adapter lands.
  // Select who implements/reviews via DR_IMPLEMENTER / DR_REVIEWER (defaults: claude -> codex).
  const config: PipelineConfig = {
    implementer: (process.env.DR_IMPLEMENTER as Vendor) ?? "claude",
    reviewer: (process.env.DR_REVIEWER as Vendor) ?? "codex",
  };
  const adapters = {
    claude: echoAdapter("claude"),
    codex: process.env.DR_CODEX_LIVE ? codexAdapter() : echoAdapter("codex"),
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
