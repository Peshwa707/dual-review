/** Strip a ```json ... ``` fence (any case) if the model wrapped its JSON; else return input. */
export function stripFences(s: string): string {
  const m = s.trim().match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (m && m[1] ? m[1] : s).trim();
}

/**
 * Parse a review verdict; fail CLOSED (approved: false) on anything unparseable or
 * wrong-typed. Tries the raw string first (so a ``` inside a `notes` value doesn't break
 * valid JSON), then a de-fenced version. Shared by every real vendor adapter's review step.
 */
export function parseReview(raw: string): { approved: boolean; notes: string } {
  for (const candidate of [raw.trim(), stripFences(raw)]) {
    try {
      const obj = JSON.parse(candidate) as { approved?: unknown; notes?: unknown };
      if (typeof obj.approved === "boolean") {
        return { approved: obj.approved, notes: typeof obj.notes === "string" ? obj.notes : "" };
      }
    } catch {
      // try the next candidate
    }
  }
  return { approved: false, notes: `unparseable review output: ${raw.slice(0, 200)}` };
}

/** Parse a judge verdict; fail CLOSED to candidate 0 on anything unparseable or out of range. */
export function parseJudge(raw: string, n: number): { winner: number; notes: string } {
  for (const candidate of [raw.trim(), stripFences(raw)]) {
    try {
      const obj = JSON.parse(candidate) as { winner?: unknown; notes?: unknown };
      if (typeof obj.winner === "number" && Number.isInteger(obj.winner) && obj.winner >= 0 && obj.winner < n) {
        return { winner: obj.winner, notes: typeof obj.notes === "string" ? obj.notes : "" };
      }
    } catch {
      // try the next candidate
    }
  }
  return { winner: 0, notes: `unparseable or out-of-range judge output; defaulted to candidate 0` };
}
