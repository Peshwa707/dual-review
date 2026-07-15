import type { Artifact, ReviewResult, Task, Vendor } from "../types";

/**
 * A vendor adapter can implement a task and review an artifact.
 * v0 ships an echo (mock) adapter; real Claude Code / Codex / Cursor adapters land in v1+.
 */
export interface Adapter {
  vendor: Vendor;
  implement(task: Task): Promise<Artifact>;
  review(task: Task, artifact: Artifact): Promise<ReviewResult>;
}
