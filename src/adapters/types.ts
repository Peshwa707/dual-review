import type { Artifact, JudgeResult, ReviewResult, Task, Vendor } from "../types";

/**
 * A vendor adapter can implement a task and review an artifact, and optionally judge
 * the best of N candidate implementations (best-of-N).
 */
export interface Adapter {
  vendor: Vendor;
  implement(task: Task): Promise<Artifact>;
  review(task: Task, artifact: Artifact): Promise<ReviewResult>;
  /** Optional: pick the best of N candidate implementations. Used only for best-of-N runs. */
  judge?(task: Task, candidates: Artifact[]): Promise<JudgeResult>;
}
