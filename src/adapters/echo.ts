import type { Adapter } from "./types";
import type { Artifact, ReviewResult, Task, Vendor } from "../types";

/**
 * Deterministic mock adapter. Lets the whole pipeline run end-to-end with no
 * external model call — used for tests and dry runs until real vendor adapters land.
 */
export function echoAdapter(vendor: Vendor): Adapter {
  return {
    vendor,
    async implement(task: Task): Promise<Artifact> {
      return { by: vendor, content: `// generated for ${task.id} by ${vendor}\n` };
    },
    async review(_task: Task, artifact: Artifact): Promise<ReviewResult> {
      return { by: vendor, approved: true, notes: `echo review of artifact by ${artifact.by}` };
    },
  };
}
