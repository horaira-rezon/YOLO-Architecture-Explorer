import { create } from "zustand";

/** Edges currently carrying the walkthrough's moving dot. */
interface WalkEdges {
  ids: Set<string>;
  seconds: number;
  set(ids: Set<string>, seconds: number): void;
}

export const useWalkEdges = create<WalkEdges>((set) => ({
  ids: new Set(),
  seconds: 1.6,
  set: (ids, seconds) => set({ ids, seconds }),
}));
