import { describe, expect, test } from "bun:test";
import { parseReview, stripFences } from "../src/adapters/parse";

describe("parseReview", () => {
  test("parses plain JSON", () => {
    expect(parseReview('{"approved":true,"notes":"ok"}')).toEqual({ approved: true, notes: "ok" });
  });
  test("parses fenced JSON", () => {
    expect(parseReview('```json\n{"approved":false,"notes":"n"}\n```')).toEqual({ approved: false, notes: "n" });
  });
  test("parses an UPPERCASE fence tag", () => {
    expect(parseReview('```JSON\n{"approved":true,"notes":"n"}\n```').approved).toBe(true);
  });
  test("handles a ``` inside the notes value (raw JSON parses first)", () => {
    expect(parseReview('{"approved":true,"notes":"use ```x``` here"}').approved).toBe(true);
  });
  test("defaults notes to empty string when missing", () => {
    expect(parseReview('{"approved":true}')).toEqual({ approved: true, notes: "" });
  });
  test("fails closed on non-boolean 'approved'", () => {
    expect(parseReview('{"approved":"yes","notes":"n"}').approved).toBe(false);
  });
  test("fails closed on garbage", () => {
    expect(parseReview("totally not json").approved).toBe(false);
  });
});

describe("stripFences", () => {
  test("returns the inside of the first fenced block", () => {
    expect(stripFences("```\nX\n```")).toBe("X");
  });
  test("returns input unchanged when unfenced", () => {
    expect(stripFences("plain")).toBe("plain");
  });
});
