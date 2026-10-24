import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AIError, MockProvider, PatchSchema, ReliableClient, WEED_PRESET, applyPatchDraft, buildExplainUser, buildPatchUser,
  compileYaml, computeArchitecture, extractJson, runPatchLoop, toJsonSchema, toOperation, withRetry,
  type LLMClient, type ModelData,
} from "../src";

const meta = { source: { repo: "t", file: "t" }, confidence: "verified" as const, retrievedAt: "2026-10-24", notes: [] };
const load = (v = "v8") => {
  const d = JSON.parse(readFileSync(join(__dirname, "..", "data", "models", `${v}.json`), "utf8")) as ModelData;
  return compileYaml(d.tasks.detect!.variants.n!.yamlText, { version: v, task: "detect", scale: "n", meta });
};

describe("AI patch loop (MockProvider)", () => {
  it("weed preset gives a valid, validated patch on v8 and YOLO26", async () => {
    for (const v of ["v8", "26"]) {
      const arch = load(v);
      const r = await runPatchLoop(new MockProvider(), { arch, comp: computeArchitecture(arch), goal: WEED_PRESET, level: "simple" });
      expect(r.ok, r.problems.join("; ")).toBe(true);
      expect(r.patch!.operations.map((o) => o.op)).toEqual(["changeNc", "insertNode", "addHeadLevel", "replaceNode"]);
      expect(r.result!.draft.config.nc).toBe(4);
      expect(r.patch!.operations.every((o) => o.isHypothesis && o.rationaleForGoal.length > 10)).toBe(true);
    }
  });

  it("repairs an invalid first answer", async () => {
    const arch = load();
    const attempts: number[] = [];
    const r = await runPatchLoop(new MockProvider({ breakFirst: true }), { arch, comp: computeArchitecture(arch), goal: WEED_PRESET, level: "simple" }, { onAttempt: (n) => attempts.push(n) });
    expect(r.ok).toBe(true);
    expect(attempts).toEqual([1, 2]);
  });

  it("reports schema problems in a form the model can repair", () => {
    expect(() => toOperation({ op: "insertNode", rationaleSimple: "a", rationaleForGoal: "b", tradeoff: "c", risk: "d", confidence: "low", isHypothesis: true, breaksPretrained: false })).toThrow(/needs "after"/);
    expect(() => toOperation({ op: "replaceNode", nodeId: "n1", module: "Conv", args: "[64, 3", rationaleSimple: "a", rationaleForGoal: "b", tradeoff: "c", risk: "d", confidence: "low", isHypothesis: true, breaksPretrained: false })).toThrow(/not valid JSON/);
  });

  it("applies only the selected operations", async () => {
    const arch = load();
    const patch = PatchSchema.parse(await new MockProvider().generatePatch({ arch, comp: computeArchitecture(arch), goal: WEED_PRESET, level: "simple" }));
    const r = applyPatchDraft(arch, patch, new Set([0, 1]));
    expect(r.errors).toEqual([]);
    expect(r.draft.nodes.length).toBe(arch.nodes.length + 1);
  });
});

describe("AI plumbing", () => {
  it("patch JSON schema is flat (no refs, unions or recursion)", () => {
    const s = JSON.stringify(toJsonSchema(PatchSchema));
    expect(s).not.toMatch(/\$ref|anyOf|oneOf|allOf/);
  });
  it("extracts JSON from fenced replies", () => {
    expect(extractJson('Sure!\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(() => extractJson("no json here")).toThrow(AIError);
  });
  it("retries 429 with backoff, then succeeds; caches by request", async () => {
    let calls = 0;
    const flaky: LLMClient = { id: "t", model: "m", complete: async () => { calls++; if (calls < 2) throw new AIError("rate", 429, true, 1); return "ok"; } };
    const store = new Map<string, string>();
    const c = new ReliableClient(flaky, { get: async (k) => store.get(k), set: async (k, v) => void store.set(k, v) });
    expect(await c.complete({ system: "s", user: "u" })).toBe("ok");
    expect(await c.complete({ system: "s", user: "u" })).toBe("ok");
    expect(calls).toBe(2);
    await expect(withRetry(async () => { throw new AIError("bad key", 401, false); })).rejects.toThrow("bad key");
  });
  it("cancel stops retries", async () => {
    const ac = new AbortController();
    const p = withRetry(async () => { throw new AIError("busy", 503, true, 50); }, ac.signal);
    ac.abort();
    await expect(p).rejects.toThrow();
  });
});

describe("prompt builders (snapshots)", () => {
  it("patch prompt", () => {
    const arch = load();
    expect(buildPatchUser({ arch, comp: computeArchitecture(arch), goal: WEED_PRESET, level: "simple" })).toMatchSnapshot();
  });
  it("explain prompt", () => {
    const arch = load();
    expect(buildExplainUser({ arch, comp: computeArchitecture(arch), goal: WEED_PRESET, level: "eli5", nodeIds: ["n9", "n15", "n22"], rationales: {} })).toMatchSnapshot();
  });
  it("token budget drops the params column first", () => {
    const arch = load();
    const full = buildPatchUser({ arch, comp: computeArchitecture(arch), goal: WEED_PRESET, level: "simple" });
    const small = buildPatchUser({ arch, comp: computeArchitecture(arch), goal: WEED_PRESET, level: "simple", tokenBudget: 100 });
    expect(small.length).toBeLessThan(full.length);
  });
});
