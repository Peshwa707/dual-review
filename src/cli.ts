#!/usr/bin/env bun
import { claudeAdapter } from "./adapters/claude";
import { codexAdapter } from "./adapters/codex";
import { echoAdapter } from "./adapters/echo";
import { MAX_BEST_OF } from "./bestof";
import { runPipeline } from "./pipeline";
import { assertTask } from "./task";
import type { PipelineConfig, Vendor } from "./types";

const HELP = `dual-review — one model implements, a different-vendor model reviews, gates verify.

Usage:
  dual-review run <task.json>
  dual-review help

Task JSON:
  { "id": "...", "prompt": "...",
    "verify": { "command": "echo hi" | ["echo","hi"], "expect": "hi", "env": "inherit|clean" } }

Environment:
  DR_IMPLEMENTER=<claude|codex>   who writes the code   (default: claude)
  DR_REVIEWER=<claude|codex>      who reviews it        (default: codex) — must differ from implementer
  DR_CLAUDE_LIVE=1                use the real claude CLI (else a mock)
  DR_CODEX_LIVE=1                 use the real codex CLI  (else a mock)
  DR_BEST_OF=<N>                  generate N candidates; the reviewer judges the best (default: 1)

Real cross-vendor example (run from a plain shell, NOT inside Claude Code):
  DR_CLAUDE_LIVE=1 DR_CODEX_LIVE=1 DR_IMPLEMENTER=claude DR_REVIEWER=codex \\
    bun run src/cli.ts run examples/toy.json
`;

async function main(): Promise<void> {
  const [cmd, taskPath] = process.argv.slice(2);
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(HELP);
    return;
  }
  if (cmd !== "run" || !taskPath) {
    console.error(HELP);
    process.exit(2);
  }

  const raw = await Bun.file(taskPath).json();
  assertTask(raw);
  const task = raw;

  // Adapter registry. A vendor is the real adapter when its DR_*_LIVE flag is set, else a mock.
  const config: PipelineConfig = {
    implementer: (process.env.DR_IMPLEMENTER as Vendor) ?? "claude",
    reviewer: (process.env.DR_REVIEWER as Vendor) ?? "codex",
  };
  const adapters = {
    claude: process.env.DR_CLAUDE_LIVE ? claudeAdapter() : echoAdapter("claude"),
    codex: process.env.DR_CODEX_LIVE ? codexAdapter() : echoAdapter("codex"),
  };

  // Validate vendor selection at the CLI boundary, not deep in the pipeline.
  for (const [role, vendor] of [
    ["DR_IMPLEMENTER", config.implementer],
    ["DR_REVIEWER", config.reviewer],
  ] as const) {
    if (!(vendor in adapters)) {
      console.error(`unknown ${role} "${vendor}" (known: ${Object.keys(adapters).join(", ")})`);
      process.exit(2);
    }
  }

  let bestOf = 1;
  if (process.env.DR_BEST_OF) {
    bestOf = Number(process.env.DR_BEST_OF);
    if (!Number.isInteger(bestOf) || bestOf < 1 || bestOf > MAX_BEST_OF) {
      console.error(`DR_BEST_OF must be an integer between 1 and ${MAX_BEST_OF} (got "${process.env.DR_BEST_OF}")`);
      process.exit(2);
    }
  }

  const verdict = await runPipeline(task, config, adapters, undefined, { bestOf });
  console.log(JSON.stringify(verdict, null, 2));

  const parts = [`VERDICT: ${verdict.passed ? "PASS" : "FAIL"}`];
  if (verdict.candidates) parts.push(`[best-of-${verdict.candidates}, winner #${verdict.judge?.winner}]`);
  if (verdict.mockRun) parts.push("(MOCK RUN — not a real cross-vendor review)");
  console.log(parts.join(" "));
  process.exit(verdict.passed ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
