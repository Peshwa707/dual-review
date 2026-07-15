// Core types for the dual-review harness.

/** A model/tool that can implement or review. Cross-vendor pairing is enforced by vendor family. */
export type Vendor = "claude" | "codex" | "cursor" | "kimi" | "echo";

/** A unit of work: a prompt plus how to prove it actually works at runtime. */
export interface Task {
  id: string;
  prompt: string;
  verify: VerifySpec;
}

/** Runtime verification: run a command and assert the expected substring appears in output. */
export interface VerifySpec {
  command: string;
  expect: string;
  /** Wall-clock limit for the verify command, in ms. Defaults to 30000. */
  timeoutMs?: number;
}

/** The output of an implementer. */
export interface Artifact {
  content: string;
  by: Vendor;
  /** True when produced by a mock adapter — so a mock never impersonates a real vendor's output. */
  mock?: boolean;
}

/** A cross-vendor reviewer's verdict on an artifact. */
export interface ReviewResult {
  approved: boolean;
  by: Vendor;
  notes: string;
  /** True when produced by a mock adapter. */
  mock?: boolean;
}

export type GateStatus = "pass" | "fail";

/** Result of one gate in the ordered gate sequence. */
export interface GateResult {
  gate: string;
  status: GateStatus;
  evidence: string;
}

/** Who implements vs. who reviews. The two MUST be different vendors. */
export interface PipelineConfig {
  implementer: Vendor;
  reviewer: Vendor;
}

/** Final outcome of a pipeline run. */
export interface Verdict {
  task: string;
  passed: boolean;
  /** True if the artifact or review came from a mock adapter — a mock run is NOT a genuine cross-vendor pass. */
  mockRun: boolean;
  artifact: Artifact;
  review: ReviewResult;
  gates: GateResult[];
}
