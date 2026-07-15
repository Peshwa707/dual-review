# dual-review — v1 scope

**Status: ✅ v1 COMPLETE.** Every slice below shipped, was cross-vendor-reviewed by a different model
family (GPT-5.4 via `codex exec`), and hardened from that review. 76 tests pass (1 live-skip).

**Goal (met):** the harness does a *real* cross-vendor build — a real model implements, a
different-vendor real model reviews, gates verify — replacing the v0 echo mock.

## Locked decisions
- **Adapter execution:** shell out to the vendor CLIs (`codex exec`, `claude -p`). No API keys / billing in the repo — users bring their own installed/authed CLIs. Prompt passed via **stdin** (never argv).
- **Implementer output (v1):** code-as-text. The runtime gate runs the task's own `verify.command`. Workspace file-editing deferred.

## Slices (each: implement → runtime-prove → cross-vendor Forge review → harden → push)

- **✅ v1.0 — Codex adapter** (`codex exec`) + `mock` provenance flag. Live-verified.
- **✅ v1.1 — Claude adapter** (`claude -p`) → first real-vs-real pair (Claude implements → Codex reviews). Live path is DEFERRED-VERIFY (can't run `claude` nested).
- **✅ v1.2a — Hardened runtime gate:** `command: string | string[]` (argv = no shell injection); `env: "clean"` least-privilege env; empty-`expect` + non-finite-`timeoutMs` rejected; inherit-env regression fixed.
- **✅ v1.2b — Prompt via stdin + tool posture pinned:** Codex `-s read-only`; Claude deny-by-default (empty `--allowedTools` + `--strict-mcp-config`). Codex temp output in a private `mkdtemp` dir.
- **✅ v1.3 — Gate registry:** `Gate { name; run(task, artifact) }` + ordered gates with short-circuit; gates fail **closed** (a throw becomes a recorded fail); `Gate.name` is authoritative. Runtime gate is the default.

## Deferred to v2 (explicitly not built in v1)
- **Sandboxing:** kill orphaned process groups on timeout (a backgrounded grandchild under `sh -c` can currently outlive the gate); full network + filesystem isolation; restrict `argv[0]` interpreters for less-trusted specs.
- **Env:** declarative per-task env passthrough (`{ mode, passthrough }`).
- **Verification:** a live Claude-path spike (needs an out-of-session run) that proves a tool call is actually refused.
- **Gates:** maintainability + security gates as registered gates (the registry now supports them).
- **Reach:** best-of-N implementations with a judge; per-project quality rubric; teach-by-example exemplars; workspace file-editing implementer; Cursor + long-context adapters; HTTP-API adapters.
