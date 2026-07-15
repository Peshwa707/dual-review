import { describe, expect, test } from "bun:test";
import { echoAdapter } from "../src/adapters/echo";
import type { Task } from "../src/types";

const task: Task = { id: "t", prompt: "p", verify: { command: "echo e", expect: "e" } };

describe("echoAdapter", () => {
  test("flags its artifact and review as mock", async () => {
    const a = echoAdapter("claude");
    const art = await a.implement(task);
    expect(art.mock).toBe(true);
    const r = await a.review(task, art);
    expect(r.mock).toBe(true);
    expect(r.approved).toBe(true);
  });
});
