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

  test("accepts an argv-array command", () => {
    expect(() =>
      assertTask({ id: "x", prompt: "p", verify: { command: ["echo", "hi"], expect: "hi" } }),
    ).not.toThrow();
  });

  test("rejects an empty argv-array command", () => {
    expect(() => assertTask({ id: "x", prompt: "p", verify: { command: [], expect: "e" } })).toThrow(
      /verify\.command/,
    );
  });

  test("rejects an invalid env mode", () => {
    expect(() =>
      assertTask({ id: "x", prompt: "p", verify: { command: "e", expect: "e", env: "wild" } }),
    ).toThrow(/verify\.env/);
  });

  test("rejects an empty expect (would pass on any output)", () => {
    expect(() => assertTask({ id: "x", prompt: "p", verify: { command: "e", expect: "" } })).toThrow(
      /verify\.expect/,
    );
  });

  test("rejects a non-finite timeoutMs (NaN/Infinity)", () => {
    expect(() =>
      assertTask({ id: "x", prompt: "p", verify: { command: "e", expect: "e", timeoutMs: Number.NaN } }),
    ).toThrow(/timeoutMs/);
  });

  test("accepts a valid env mode", () => {
    expect(() =>
      assertTask({ id: "x", prompt: "p", verify: { command: "e", expect: "e", env: "clean" } }),
    ).not.toThrow();
  });
});
