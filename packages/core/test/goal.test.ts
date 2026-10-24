import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MockProvider, WEED_PRESET, applyOperation, compileYaml, computeArchitecture, explainNodesBatched, goalKey,
  lookupGoalContext, nodeSignature, withNeighbours, type GoalStore, type ModelData, type StoredGoalContext,
} from "../src";

const meta = { source: { repo: "t", file: "t" }, confidence: "verified" as const, retrievedAt: "2026-10-24", notes: [] };
const d = JSON.parse(readFileSync(join(__dirname, "..", "data", "models", "v8.json"), "utf8")) as ModelData;
const arch = compileYaml(d.tasks.detect!.variants.n!.yamlText, { version: "v8", task: "detect", scale: "n", meta });
const memStore = (): GoalStore & { size(): number } => {
  const m = new Map<string, StoredGoalContext>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v), size: () => m.size };
};

describe("goal context", () => {
  it("explains every node in batches of ≤15 with progress, then skips fresh ones", async () => {
    const comp = computeArchitecture(arch);
    const store = memStore();
    const progress: number[] = [];
    const calls: number[] = [];
    const provider = new MockProvider();
    const spy = { ...provider, id: provider.id, label: provider.label, generatePatch: provider.generatePatch.bind(provider), chat: provider.chat.bind(provider),
      explainNodes: (c: Parameters<MockProvider["explainNodes"]>[0]) => { calls.push(c.nodeIds.length); return provider.explainNodes(c); } };
    const r = await explainNodesBatched({ provider: spy, arch, comp, goal: WEED_PRESET, level: "simple", nodeIds: arch.nodes.map((n) => n.id), rationales: {}, store, batchSize: 12, onProgress: (x) => progress.push(x) });
    expect(r.generated).toBe(23);
    expect(calls).toEqual([12, 11]);
    expect(progress.at(-1)).toBe(23);
    const again = await explainNodesBatched({ provider: spy, arch, comp, goal: WEED_PRESET, level: "simple", nodeIds: arch.nodes.map((n) => n.id), rationales: {}, store, skipFresh: true });
    expect(again.generated).toBe(0);
  });

  it("marks an explanation stale when the node or a neighbour changes", async () => {
    const comp = computeArchitecture(arch);
    const store = memStore();
    const provider = new MockProvider();
    await explainNodesBatched({ provider, arch, comp, goal: WEED_PRESET, level: "simple", nodeIds: withNeighbours(arch, comp, "n15"), rationales: {}, store });
    const gk = goalKey(WEED_PRESET, "simple", provider.id);
    expect((await lookupGoalContext(store, gk, arch, comp, "n15")).state).toBe("fresh");
    const edited = applyOperation(arch, { op: "insertNode", after: "n15", node: { module: "CBAM", args: [7], repeats: 1 } }, { opId: "t" });
    const comp2 = computeArchitecture(edited);
    expect((await lookupGoalContext(store, gk, edited, comp2, "n15")).state).toBe("stale");
    expect((await lookupGoalContext(store, gk, edited, comp2, "n3")).state).toBe("none");
    expect(nodeSignature(edited, comp2, "n3")).toBe(nodeSignature(arch, comp, "n3"));
  });
});
