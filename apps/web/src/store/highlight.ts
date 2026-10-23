import { create } from "zustand";

/** Ids to keep bright while hovering (the hovered item, its inputs, outputs and the edges between). */
interface HighlightState {
  set: Set<string> | null;
  setIds(ids: Set<string> | null): void;
}

export const useHighlight = create<HighlightState>((set) => ({
  set: null,
  setIds: (ids) => set({ set: ids }),
}));
