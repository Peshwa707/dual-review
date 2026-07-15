# dual-review

A small, vendor-agnostic **dual-review harness** for AI-assisted coding: one model **implements**, a **different-vendor** model **reviews**, then an ordered set of **gates** verifies the change — ending with a **runtime** gate that proves it actually runs, not just that it typechecks.

The idea is simple and load-bearing: the implementer and the reviewer should never be the same model family, because same-family models share blind spots. Cross-vendor review catches what a self-review misses.

## Status

**v0 — orchestration skeleton.** The pipeline runs end-to-end with a deterministic mock (`echo`) adapter so the flow is testable with zero external model calls. Real vendor adapters (Claude Code, Codex, Cursor, long-context models) land in v1.

## The pipeline

```
implement (implementer vendor)
   → review (cross-vendor reviewer)   ← implementer ≠ reviewer, enforced
      → gates (v0: runtime; v1+: correctness · maintainability · security · runtime)
         → verdict (PASS / FAIL)
```

**Runtime gate:** runs the task's `verify.command` and asserts `verify.expect` appears in output. A build/typecheck passing is never accepted as proof.

## Usage

```bash
bun install
bun test                       # unit tests for the pipeline
bun run src/cli.ts run examples/toy.json
```

A task is JSON:

```json
{
  "id": "toy",
  "prompt": "Make the greeting command print a hello line.",
  "verify": { "command": "echo hello world", "expect": "hello" }
}
```

## Design principles

- **Cross-vendor by construction** — implementer and reviewer are different vendor families.
- **Runtime over typecheck** — the final gate observes real behavior.
- **Small, ordered gates** — rigor scales with stakes; gates run in sequence and short-circuit.
- **Adapters, not lock-in** — any model/tool that can implement or review plugs in behind one interface.

## Roadmap

- **v1** — real adapters: Claude Code, Codex (`codex exec`), Cursor, long-context models.
- **v1** — maintainability + security gates ahead of the runtime gate.
- **v2** — best-of-N implementations with a judge; per-project quality rubric; teach-by-example exemplars.

## License

MIT
