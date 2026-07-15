# dual-review — v1 scope

**Goal:** the harness does a *real* cross-vendor build — a real model implements, a
different-vendor real model reviews, the runtime gate verifies — replacing the v0 echo mock.

## Locked decisions
- **Adapter execution:** shell out to the vendor CLIs (`codex exec`, `claude -p`). No API keys, no billing config in the repo — users bring their own installed/authed CLIs.
- **Implementer output (v1):** code-as-text. The implementer returns proposed code as text; the runtime gate runs the task's own `verify.command`. Workspace file-editing is deferred to a later slice.
- **First adapter:** Codex (fully testable in-session).

## Slices (each gated: implement → cross-vendor review → runtime proof → commit)

### v1.0 — Adapter contract + real Codex adapter
- `codexAdapter()` shells to `codex exec`: `implement(task)` builds a prompt from `task.prompt` and returns `Artifact{ by: "codex", content }`; `review(task, artifact)` asks Codex to approve/reject and parses `ReviewResult{ approved, notes }`.
- Add `mock?: true` to `Artifact`/`ReviewResult`; the echo adapter sets it, so a mock never impersonates a real vendor (Forge §2.2).
- Cross-vendor still holds: v1.0 pairs `codex` (real) with `echo` (mock, different vendor) to prove the real adapter inside the pipeline. Full real-vs-real pair lands in v1.1.
- Robustness: CLI failure / non-zero exit / timeout → clean `ReviewResult`/error, never a hang.
- **Tests:** unit tests stay hermetic (echo); live `codex exec` calls guarded behind an env flag (`DR_LIVE=1`) so CI/others don't need Codex auth. One manual live proof recorded.
- **Acceptance:** a real `codex exec` call yields an artifact; `codex`+`echo` pipeline runs end-to-end; verdict computed; failures handled.

### v1.1 — Real Claude Code adapter
- `claudeAdapter()` shells to `claude -p` (non-interactive). First real cross-vendor pair: Claude implements → Codex reviews.
- ⚠️ **Gotcha:** cannot be runtime-tested from inside a Claude Code session — `CLAUDECODE` env blocks a nested `claude` subprocess. Verify out-of-session or via a documented manual run; note it in the README.

### v1.2 — Hardened runtime gate for untrusted specs (Forge security finding)
- Accept an explicit `command: string[]` (argv) and run without a shell by default; `sh -c` becomes opt-in per task and loudly flagged.
- Scrub the environment to a minimal allowlist (no inherited secrets).
- Keep the existing wall-clock timeout + output cap.

### v1.3 — Gate registry
- `Gate` interface (`name`, `run(task, ctx) => GateResult`) + an ordered array with short-circuit, so v2 can add maintainability + security gates as registered gates rather than new call sites.

## Deferred to v2
- Maintainability + security gates (as registered gates).
- Best-of-N implementations with a judge; per-project quality rubric; teach-by-example exemplars.
- Workspace file-editing implementer; Cursor + long-context adapters; HTTP-API adapters.
