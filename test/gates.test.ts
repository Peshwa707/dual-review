import { describe, expect, test } from "bun:test";
import { runPipeline } from "../src/pipeline";
import { echoAdapter } from "../src/adapters/echo";
import type { Adapter } from "../src/adapters/types";
import type { Gate } from "../src/gates/types";
import type { GateStatus, PipelineConfig, Task, Vendor } from "../src/types";

const config: PipelineConfig = { implementer: "claude", reviewer: "codex" };
const adapters = { claude: echoAdapter("claude"), codex: echoAdapter("codex") };
const task: Task = { id: "t", prompt: "p", verify: { command: "echo hi", expect: "hi" } };

/** A fake gate that records that it ran (to prove ordering / short-circuit). */
function fakeGate(name: string, status: GateStatus, log: string[]): Gate {
  return {
    name,
    async run() {
      log.push(name);
      return { gate: name, status, evidence: "fake" };
    },
  };
}

describe("gate registry", () => {
  test("runs gates in order and passes when all pass", async () => {
    const log: string[] = [];
    const v = await runPipeline(task, config, adapters, [fakeGate("a", "pass", log), fakeGate("b", "pass", log)]);
    expect(log).toEqual(["a", "b"]);
    expect(v.gates.map((g) => g.gate)).toEqual(["a", "b"]);
    expect(v.passed).toBe(true);
  });

  test("short-circuits: a failing gate stops later gates from running", async () => {
    const log: string[] = [];
    const v = await runPipeline(task, config, adapters, [fakeGate("a", "fail", log), fakeGate("b", "pass", log)]);
    expect(log).toEqual(["a"]); // b never ran
    expect(v.gates.map((g) => g.gate)).toEqual(["a"]);
    expect(v.passed).toBe(false);
  });

  test("an empty gate list passes on review approval alone", async () => {
    const v = await runPipeline(task, config, adapters, []);
    expect(v.gates).toEqual([]);
    expect(v.passed).toBe(true); // echo review approves
  });

  test("no gates run when the review is not approved", async () => {
    const rejectingCodex: Adapter = {
      vendor: "codex" as Vendor,
      async implement(t) {
        return { by: "codex", content: `// ${t.id}` };
      },
      async review() {
        return { by: "codex", approved: false, notes: "no" };
      },
    };
    const log: string[] = [];
    const v = await runPipeline(task, config, { claude: echoAdapter("claude"), codex: rejectingCodex }, [
      fakeGate("a", "pass", log),
    ]);
    expect(log).toEqual([]); // review rejected -> gate never ran
    expect(v.gates).toEqual([]);
    expect(v.passed).toBe(false);
  });

  test("records every gate when a later gate fails", async () => {
    const log: string[] = [];
    const v = await runPipeline(task, config, adapters, [fakeGate("a", "pass", log), fakeGate("b", "fail", log)]);
    expect(log).toEqual(["a", "b"]);
    expect(v.gates.map((g) => g.gate)).toEqual(["a", "b"]);
    expect(v.passed).toBe(false);
  });

  test("a throwing gate fails closed (recorded as fail, pipeline does not crash)", async () => {
    const throwingGate: Gate = {
      name: "boom",
      async run() {
        throw new Error("kaboom");
      },
    };
    const v = await runPipeline(task, config, adapters, [throwingGate]);
    expect(v.gates).toHaveLength(1);
    expect(v.gates[0]?.gate).toBe("boom"); // identity comes from Gate.name
    expect(v.gates[0]?.status).toBe("fail");
    expect(v.passed).toBe(false);
  });

  test("the pipeline stamps the gate's name onto the result (name is authoritative)", async () => {
    const misnamed: Gate = {
      name: "official",
      async run() {
        return { gate: "SELF-REPORTED", status: "pass", evidence: "x" };
      },
    };
    const v = await runPipeline(task, config, adapters, [misnamed]);
    expect(v.gates[0]?.gate).toBe("official"); // not "SELF-REPORTED"
  });

  test("defaults to the runtime gate when no gate list is given", async () => {
    const v = await runPipeline(task, config, adapters);
    expect(v.gates.map((g) => g.gate)).toEqual(["runtime"]);
    expect(v.passed).toBe(true);
  });
});
