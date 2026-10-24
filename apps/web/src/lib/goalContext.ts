import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import {
  explainNodesBatched, goalKey, lookupGoalContext, withNeighbours,
  type GoalLookup, type GoalStore, type StoredGoalContext,
} from "@yolo-atlas/core";
import { useAtlas } from "../store/atlas";
import { getProvider } from "./ai";
import { persist } from "./persist";

export const goalStore: GoalStore = {
  get: (k) => persist.get<StoredGoalContext>(k),
  set: async (k, v) => void (await persist.set(k, v)),
};

/** Bumped after any explanation is written, so open panels re-read the cache. */
export const useGoalVersion = create<{ v: number; bump(): void }>((set) => ({ v: 0, bump: () => set((s) => ({ v: s.v + 1 })) }));

/** Rationale text per node from the applied AI patch (fed to the explanation prompt). */
export function rationalesFromSession(): Record<string, string> {
  const st = useAtlas.getState();
  const out: Record<string, string> = {};
  for (const n of st.arch?.nodes ?? []) {
    const op = n.modification ? st.aiSession?.notes[n.modification.opId] : undefined;
    if (op) out[n.id] = `${op.rationaleSimple} ${op.rationaleForGoal}`;
    else if (n.modification) out[n.id] = n.modification.summary;
  }
  return out;
}

/** Goal-aware explanation of one node: read cache, generate lazily (node + neighbours) when missing. */
export function useGoalContext(nodeId: string | undefined, auto = true) {
  const { arch, computed, readingLevel, goal } = useAtlas();
  const v = useGoalVersion((s) => s.v);
  const bump = useGoalVersion((s) => s.bump);
  const [lookup, setLookup] = useState<GoalLookup>({ state: "none" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const provider = getProvider();
  const gk = goal ? goalKey(goal, readingLevel, provider.id) : null;

  const generate = useCallback(async (ids?: string[]) => {
    if (!arch || !computed || !goal || !nodeId) return;
    setLoading(true);
    setError(null);
    try {
      await explainNodesBatched({ provider, arch, comp: computed, goal, level: readingLevel, nodeIds: ids ?? withNeighbours(arch, computed, nodeId), rationales: rationalesFromSession(), store: goalStore });
      bump();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [arch, computed, goal, nodeId, provider, readingLevel, bump]);

  useEffect(() => {
    let alive = true;
    if (!gk || !arch || !computed || !nodeId) {
      setLookup({ state: "none" });
      return;
    }
    void lookupGoalContext(goalStore, gk, arch, computed, nodeId).then((l) => {
      if (!alive) return;
      setLookup(l);
      if (auto && l.state === "none" && !loading && !error) void generate();
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-check when the cache version changes
  }, [gk, arch, computed, nodeId, v]);

  return { hasGoal: !!goal, lookup, loading, error, regenerate: () => generate([nodeId!]) };
}

/** Background job: explain every layer for the current goal, in batches, with progress and cancel. */
export const useExplainAll = create<{ running: boolean; done: number; total: number; error: string | null; ctrl: AbortController | null; start(): Promise<void>; cancel(): void }>((set, get) => ({
  running: false,
  done: 0,
  total: 0,
  error: null,
  ctrl: null,
  start: async () => {
    const st = useAtlas.getState();
    if (!st.arch || !st.computed || !st.goal || get().running) return;
    const ctrl = new AbortController();
    set({ running: true, done: 0, total: 0, error: null, ctrl });
    try {
      await explainNodesBatched({
        provider: getProvider(), arch: st.arch, comp: st.computed, goal: st.goal, level: st.readingLevel, nodeIds: st.arch.nodes.map((n) => n.id),
        rationales: rationalesFromSession(), store: goalStore, batchSize: 12, skipFresh: true, signal: ctrl.signal,
        onProgress: (done, total) => set({ done, total }),
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ running: false, ctrl: null });
      useGoalVersion.getState().bump();
    }
  },
  cancel: () => get().ctrl?.abort(),
}));
