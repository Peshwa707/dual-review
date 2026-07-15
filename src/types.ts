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

/** The output of an implementer (a stub in v0; real diffs/files land in v1+). */
export interface Artifact {
  content: string;
  by: Vendor;
}

/** A cross-vendor reviewer's verdict on an artifact. */
export interface ReviewResult {
  approved: boolean;
  by: Vendor;
  notes: string;
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
  artifact: Artifact;
  review: ReviewResult;
  gates: GateResult[];
}
