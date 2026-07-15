import type { Artifact, Task } from "../types";

/** Default wall-clock budget for a single model CLI call. */
export const AGENT_TIMEOUT_MS = 120_000;

/**
 * Prompt builders shared by every vendor adapter. Keeping them identical is what makes
 * the cross-vendor comparison apples-to-apples — if the review rubric drifts between
 * vendors, the whole premise breaks. Change these in ONE place.
 */
export function buildImplementPrompt(task: Task): string {
  return (
    `Implement this coding task. Return ONLY the code — no explanation, no markdown fences.\n\n` +
    `Task: ${task.prompt}`
  );
}

export function buildReviewPrompt(task: Task, artifact: Artifact): string {
  return (
    `Review the artifact below against the task: "${task.prompt}".\n` +
    `Respond ONLY with JSON of the form {"approved": boolean, "notes": string}. ` +
    `Approve only if the artifact correctly and safely addresses the task.\n\n` +
    `Artifact:\n${artifact.content}`
  );
}

export function buildJudgePrompt(task: Task, candidates: Artifact[]): string {
  const blocks = candidates.map((c, i) => `--- Candidate ${i} ---\n${c.content}`).join("\n\n");
  return (
    `Pick the single best implementation of this task: "${task.prompt}".\n` +
    `Respond ONLY with JSON of the form {"winner": <0-based index>, "notes": string}.\n\n` +
    blocks
  );
}
