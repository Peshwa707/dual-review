import type { Adapter } from "./adapters/types";
import { runtimeGateDef } from "./gates/runtime";
import type { Gate } from "./gates/types";
import type { Artifact, GateResult, JudgeResult, PipelineConfig, Task, Verdict } from "./types";

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
  gates: Gate[] = [runtimeGateDef],
  opts: { bestOf?: number } = {},
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

  // Best-of-N: generate N candidates and let the (cross-vendor) reviewer judge the winner.
  const bestOf = Math.max(1, Math.floor(opts.bestOf ?? 1));
  let artifact: Artifact;
  let candidateCount: number | undefined;
  let judge: JudgeResult | undefined;
  if (bestOf > 1) {
    const candidates = await Promise.all(Array.from({ length: bestOf }, () => impl.implement(task)));
    candidateCount = candidates.length;
    if (rev.judge) {
      try {
        judge = await rev.judge(task, candidates);
      } catch (err) {
        judge = { by: rev.vendor, winner: 0, notes: `judge threw: ${err instanceof Error ? err.message : String(err)}` };
      }
    } else {
      judge = { by: rev.vendor, winner: 0, notes: "reviewer has no judge; picked candidate 0" };
    }
    const w = judge.winner >= 0 && judge.winner < candidates.length ? judge.winner : 0;
    artifact = candidates[w] as Artifact;
  } else {
    artifact = await impl.implement(task);
  }
  const review = await rev.review(task, artifact);

  // Run gates in order, short-circuiting on the first failure. No gates run if review rejected.
  // A gate that throws fails closed (recorded as a fail), never crashing the pipeline.
  // The gate's own `name` is authoritative — stamped onto the result.
  const gateResults: GateResult[] = [];
  if (review.approved) {
    for (const gate of gates) {
      let result: GateResult;
      try {
        result = { ...(await gate.run(task, artifact)), gate: gate.name };
      } catch (err) {
        result = { gate: gate.name, status: "fail", evidence: `gate threw: ${err instanceof Error ? err.message : String(err)}` };
      }
      gateResults.push(result);
      if (result.status !== "pass") break;
    }
  }
  const passed = review.approved && gateResults.every((g) => g.status === "pass");
  const mockRun = Boolean(artifact.mock || review.mock || judge?.mock);

  const verdict: Verdict = { task: task.id, passed, mockRun, artifact, review, gates: gateResults };
  if (candidateCount !== undefined) {
    verdict.candidates = candidateCount;
    verdict.judge = judge;
  }
  return verdict;
}
