import type { Task } from "./types";

/** Validate an untrusted, parsed JSON value as a Task. Throws a clear error on any violation. */
export function assertTask(x: unknown): asserts x is Task {
  if (typeof x !== "object" || x === null) {
    throw new Error("invalid task: expected a JSON object");
  }
  const t = x as Record<string, unknown>;
  if (typeof t.id !== "string" || t.id.length === 0) {
    throw new Error("invalid task: 'id' must be a non-empty string");
  }
  if (typeof t.prompt !== "string") {
    throw new Error("invalid task: 'prompt' must be a string");
  }
  if (typeof t.verify !== "object" || t.verify === null) {
    throw new Error("invalid task: 'verify' must be an object");
  }
  const v = t.verify as Record<string, unknown>;
  if (typeof v.command === "string") {
    if (v.command.length === 0) throw new Error("invalid task: 'verify.command' string must be non-empty");
  } else if (Array.isArray(v.command)) {
    if (v.command.length === 0 || !v.command.every((c) => typeof c === "string")) {
      throw new Error("invalid task: 'verify.command' array must be non-empty strings");
    }
  } else {
    throw new Error("invalid task: 'verify.command' must be a string or string[]");
  }
  if (typeof v.expect !== "string" || v.expect.length === 0) {
    // An empty expect matches every output (`includes("")` is always true), nullifying the gate.
    throw new Error("invalid task: 'verify.expect' must be a non-empty string");
  }
  if (
    v.timeoutMs !== undefined &&
    (typeof v.timeoutMs !== "number" || !Number.isFinite(v.timeoutMs) || v.timeoutMs <= 0)
  ) {
    throw new Error("invalid task: 'verify.timeoutMs' must be a finite positive number");
  }
  if (v.env !== undefined && v.env !== "inherit" && v.env !== "clean") {
    throw new Error("invalid task: 'verify.env' must be \"inherit\" or \"clean\"");
  }
}
