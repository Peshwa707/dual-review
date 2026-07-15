/** Strip a ```json ... ``` fence if the model wrapped its JSON. Returns the first fenced block. */
export function stripFences(s: string): string {
  const m = s.trim().match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m && m[1] ? m[1] : s).trim();
}

/**
 * Parse a review verdict; fail CLOSED (approved: false) on anything unparseable or
 * wrong-typed. Shared by every real vendor adapter's review step.
 */
export function parseReview(raw: string): { approved: boolean; notes: string } {
  try {
    const obj = JSON.parse(stripFences(raw)) as { approved?: unknown; notes?: unknown };
    if (typeof obj.approved === "boolean") {
      return { approved: obj.approved, notes: typeof obj.notes === "string" ? obj.notes : "" };
    }
  } catch {
    // fall through to fail-closed
  }
  return { approved: false, notes: `unparseable review output: ${raw.slice(0, 200)}` };
}
