import { create } from "zustand";
import { computeArchitecture, type Architecture, type ComputeResult } from "@yolo-atlas/core";

export type ReadingLevel = "eli5" | "simple" | "engineer";
export type Direction = "DOWN" | "RIGHT";
export type LayoutMode = "classic" | "flow";

export interface AtlasState {
  /** The architecture as loaded (baseline for diffs and "reset"). */
  original: Architecture | null;
  arch: Architecture | null;
  computed: ComputeResult | null;
  scales: string[];
  selectedId: string | null;
  hoveredId: string | null;
  direction: Direction;
  readingLevel: ReadingLevel;
  listView: boolean;
  layoutMode: LayoutMode;
  setLayoutMode(m: LayoutMode): void;
  setLoaded(arch: Architecture, scales: string[]): void;
  setArch(arch: Architecture): void;
  select(id: string | null): void;
  hover(id: string | null): void;
  setDirection(d: Direction): void;
  setReadingLevel(l: ReadingLevel): void;
  setListView(v: boolean): void;
}

function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function writePref(key: string, v: string): void {
  try {
    localStorage.setItem(key, v);
  } catch {
    // preference only
  }
}

export const useAtlas = create<AtlasState>((set) => ({
  original: null,
  arch: null,
  computed: null,
  scales: [],
  selectedId: null,
  hoveredId: null,
  direction: readPref("atlas-direction", ["DOWN", "RIGHT"] as const, "DOWN"),
  readingLevel: readPref("atlas-level", ["eli5", "simple", "engineer"] as const, "simple"),
  listView: false,
  layoutMode: readPref("atlas-layout", ["classic", "flow"] as const, "classic"),
  setLayoutMode: (layoutMode) => {
    writePref("atlas-layout", layoutMode);
    set({ layoutMode });
  },
  setLoaded: (arch, scales) => set({ original: arch, arch, computed: computeArchitecture(arch), scales, selectedId: null, hoveredId: null }),
  setArch: (arch) => set({ arch, computed: computeArchitecture(arch) }),
  select: (selectedId) => set({ selectedId }),
  hover: (hoveredId) => set({ hoveredId }),
  setDirection: (direction) => {
    writePref("atlas-direction", direction);
    set({ direction });
  },
  setReadingLevel: (readingLevel) => {
    writePref("atlas-level", readingLevel);
    set({ readingLevel });
  },
  setListView: (listView) => set({ listView }),
}));
