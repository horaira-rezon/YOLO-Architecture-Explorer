import type { Architecture } from "../schema";
import type { ComputeResult } from "../engine/compute";
import type { Level } from "../content/schema";
import { stableHash } from "../util/math";
import type { AIProvider } from "./provider";
import type { GoalSpec } from "./context";
import type { NodeGoal } from "./schema";
import { EXPLAIN_PROMPT_VERSION } from "./prompts/explain.v1";

/**
 * What a node's explanation depends on: the node itself, its inputs and its consumers (module, args, shapes).
 * When this changes, a cached explanation is marked stale.
 */
export function nodeSignature(arch: Architecture, comp: ComputeResult, nodeId: string): string {
  const n = arch.nodes.find((x) => x.id === nodeId);
  if (!n) return "missing";
  const brief = (id: string) => {
    const m = arch.nodes.find((x) => x.id === id);
    return m ? [id, m.module, m.args, comp.nodes[id]?.outShape] : [id];
  };
  return stableHash(JSON.stringify([n.module, n.args, n.repeats, comp.nodes[nodeId]?.outShape, n.from.map(brief), (comp.consumers[nodeId] ?? []).map(brief), arch.config.nc, arch.inputSize]));
}

/** Key for one explanation context (goal + reading level + provider + prompt version). */
export function goalKey(goal: GoalSpec, level: Level, providerId: string): string {
  return stableHash(JSON.stringify([goal, level, providerId, EXPLAIN_PROMPT_VERSION]));
}

export interface StoredGoalContext {
  signature: string;
  data: NodeGoal;
  createdAt: string;
}

export interface GoalStore {
  get(key: string): Promise<StoredGoalContext | undefined>;
  set(key: string, value: StoredGoalContext): Promise<void>;
}

export const goalEntryKey = (gk: string, nodeId: string) => `goalctx:${gk}:${nodeId}`;

/** Neighbours explained together with a clicked node (lazy mode): its inputs and consumers, max `limit`. */
export function withNeighbours(arch: Architecture, comp: ComputeResult, nodeId: string, limit = 6): string[] {
  const n = arch.nodes.find((x) => x.id === nodeId);
  if (!n) return [];
  return [...new Set([nodeId, ...n.from, ...(comp.consumers[nodeId] ?? [])])].slice(0, limit);
}

export interface ExplainJob {
  provider: AIProvider;
  arch: Architecture;
  comp: ComputeResult;
  goal: GoalSpec;
  level: Level;
  nodeIds: string[];
  rationales: Record<string, string>;
  store: GoalStore;
  batchSize?: number;
  signal?: AbortSignal;
  onProgress?(done: number, total: number): void;
  /** Skip nodes whose stored explanation is still fresh. */
  skipFresh?: boolean;
}

/** Explain nodes in batches (12–15 per request); stores results and returns how many were generated. */
export async function explainNodesBatched(job: ExplainJob): Promise<{ generated: number; failed: string[] }> {
  const gk = goalKey(job.goal, job.level, job.provider.id);
  const todo: string[] = [];
  for (const id of job.nodeIds) {
    if (job.skipFresh) {
      const s = await job.store.get(goalEntryKey(gk, id));
      if (s && s.signature === nodeSignature(job.arch, job.comp, id)) continue;
    }
    todo.push(id);
  }
  const size = Math.min(15, Math.max(1, job.batchSize ?? 12));
  let done = 0, generated = 0;
  const failed: string[] = [];
  job.onProgress?.(0, todo.length);
  for (let i = 0; i < todo.length; i += size) {
    if (job.signal?.aborted) break;
    const batch = todo.slice(i, i + size);
    try {
      const res = await job.provider.explainNodes({ arch: job.arch, comp: job.comp, goal: job.goal, level: job.level, nodeIds: batch, rationales: job.rationales }, job.signal);
      const byId = new Map(res.nodes.map((x) => [x.nodeId, x]));
      for (const id of batch) {
        const d = byId.get(id);
        if (!d) {
          failed.push(id);
          continue;
        }
        await job.store.set(goalEntryKey(gk, id), { signature: nodeSignature(job.arch, job.comp, id), data: d, createdAt: new Date().toISOString() });
        generated++;
      }
    } catch (e) {
      if (job.signal?.aborted) break;
      failed.push(...batch);
      if (i === 0 && todo.length <= size) throw e;
    }
    done += batch.length;
    job.onProgress?.(Math.min(done, todo.length), todo.length);
  }
  return { generated, failed };
}

export type GoalLookup = { state: "none" } | { state: "fresh" | "stale"; data: NodeGoal; createdAt: string };

export async function lookupGoalContext(store: GoalStore, gk: string, arch: Architecture, comp: ComputeResult, nodeId: string): Promise<GoalLookup> {
  const s = await store.get(goalEntryKey(gk, nodeId));
  if (!s) return { state: "none" };
  return { state: s.signature === nodeSignature(arch, comp, nodeId) ? "fresh" : "stale", data: s.data, createdAt: s.createdAt };
}
