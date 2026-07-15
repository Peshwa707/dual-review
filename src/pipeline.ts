import type { Adapter } from "./adapters/types";
import { runtimeGate } from "./gates/runtime";
import type { PipelineConfig, Task, Verdict } from "./types";

/** Thrown when the same vendor would both implement and review (violates cross-vendor invariant). */
export class CrossVendorError extends Error {}

/**
 * v0 pipeline: implement -> cross-vendor review -> runtime-verify gate -> verdict.
 * Enforces implementer != reviewer vendor. Later versions add maintainability
 * and security gates ahead of the runtime gate.
 */
export async function runPipeline(
  task: Task,
  config: PipelineConfig,
  adapters: Record<string, Adapter>,
): Promise<Verdict> {
  if (config.implementer === config.reviewer) {
    throw new CrossVendorError(
      `implementer and reviewer must be different vendors (both were "${config.implementer}")`,
    );
  }
  const impl = adapters[config.implementer];
  const rev = adapters[config.reviewer];
  if (!impl) throw new Error(`no adapter registered for implementer "${config.implementer}"`);
  if (!rev) throw new Error(`no adapter registered for reviewer "${config.reviewer}"`);

  // The invariant must hold on the adapters' REAL identity, not just the config keys —
  // a codex adapter registered under the "claude" key must not slip through as "cross-vendor".
  if (impl.vendor !== config.implementer) {
    throw new CrossVendorError(
      `adapter under key "${config.implementer}" reports vendor "${impl.vendor}"`,
    );
  }
  if (rev.vendor !== config.reviewer) {
    throw new CrossVendorError(
      `adapter under key "${config.reviewer}" reports vendor "${rev.vendor}"`,
    );
  }
  if (impl.vendor === rev.vendor) {
    throw new CrossVendorError(
      `implementer and reviewer resolved to the same vendor "${impl.vendor}"`,
    );
  }

  const artifact = await impl.implement(task);
  const review = await rev.review(task, artifact);
  const gates = review.approved ? [await runtimeGate(task)] : [];
  const passed = review.approved && gates.every((g) => g.status === "pass");

  return { task: task.id, passed, artifact, review, gates };
}
