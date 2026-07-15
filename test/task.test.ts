import { describe, expect, test } from "bun:test";
import { assertTask } from "../src/task";

describe("assertTask", () => {
  test("accepts a well-formed task", () => {
    expect(() =>
      assertTask({ id: "x", prompt: "p", verify: { command: "echo hi", expect: "hi" } }),
    ).not.toThrow();
  });

  test("rejects a missing verify.command", () => {
    expect(() => assertTask({ id: "x", prompt: "p", verify: { expect: "hi" } })).toThrow(
      /verify\.command/,
    );
  });

  test("rejects a non-object", () => {
    expect(() => assertTask("nope")).toThrow(/JSON object/);
  });

  test("rejects a non-positive timeoutMs", () => {
    expect(() =>
      assertTask({ id: "x", prompt: "p", verify: { command: "e", expect: "e", timeoutMs: 0 } }),
    ).toThrow(/timeoutMs/);
  });
});
