import type { Artifact, GateResult, Task } from "../types";

/**
 * A named verification gate. The pipeline runs its gate list in order and short-circuits
 * on the first failure, so put cheaper/faster gates first. The runtime gate is the default.
 * `name` is authoritative — the pipeline stamps it onto the returned GateResult.
 * Gates receive the artifact so future gates (maintainability, security) can inspect it.
 */
export interface Gate {
  name: string;
  run(task: Task, artifact: Artifact): Promise<GateResult>;
}
