import type { GateResult, Task } from "../types";

/**
 * A named verification gate. The pipeline runs its gate list in order and short-circuits
 * on the first failure, so put cheaper/faster gates first. The runtime gate is the default.
 */
export interface Gate {
  name: string;
  run(task: Task): Promise<GateResult>;
}
