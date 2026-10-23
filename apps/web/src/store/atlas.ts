import { create } from "zustand";
import { computeArchitecture, type Architecture, type ComputeResult } from "@yolo-atlas/core";

export type ReadingLevel = "eli5" | "simple" | "engineer";
export type Direction = "DOWN" | "RIGHT";
export type LayoutMode = "classic" | "flow";

export type ZoomLevel = 0 | 1 | 2 | 3 | 4;

export interface InsideState {
  /** Layer being looked into. */
  nodeId: string;
  /** Dotted path of nested groups opened inside the layer ("" = the block itself). */
  path: string;
  /** Selected primitive / sub-block path inside the view. */
  selected: string | null;
}

export interface WalkState {
  active: boolean;
  step: number;
  playing: boolean;
  /** Seconds per step. */
  speed: number;
}

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
  zoomLevel: ZoomLevel;
  inside: InsideState | null;
  autoZoom: boolean;
  paletteOpen: boolean;
  walk: WalkState;
  /** Ask the canvas to bring a node into view (bumped counter so repeats re-trigger). */
  centerReq: { id: string; n: number } | null;
  centerOn(id: string): void;
  setZoomLevel(z: ZoomLevel): void;
  enter(nodeId: string, path?: string): void;
  insideSelect(path: string | null): void;
  exitInside(): void;
  setAutoZoom(v: boolean): void;
  setPaletteOpen(v: boolean): void;
  setWalk(w: Partial<WalkState>): void;
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
  zoomLevel: 1,
  inside: null,
  autoZoom: readPref("atlas-autozoom", ["on", "off"] as const, "on") === "on",
  paletteOpen: false,
  centerReq: null,
  centerOn: (id) => set((s) => ({ centerReq: { id, n: (s.centerReq?.n ?? 0) + 1 } })),
  walk: { active: false, step: 0, playing: false, speed: 1.6 },
  setZoomLevel: (zoomLevel) =>
    set((s) => {
      if (zoomLevel <= 1) return { zoomLevel, inside: null };
      // L2–L4 look inside a block: the selected layer, or the first real block
      const target = s.inside?.nodeId ?? (s.selectedId && s.arch?.nodes.some((n) => n.id === s.selectedId) ? s.selectedId : s.arch?.nodes.find((n) => n.module !== "nn.Upsample" && n.module !== "Concat")?.id);
      if (!target) return { zoomLevel };
      return { zoomLevel, inside: { nodeId: target, path: s.inside?.nodeId === target ? s.inside.path : "", selected: s.inside?.selected ?? null }, selectedId: target };
    }),
  enter: (nodeId, path = "") => set((s) => ({ inside: { nodeId, path, selected: null }, zoomLevel: s.zoomLevel >= 2 ? s.zoomLevel : 2, selectedId: nodeId })),
  insideSelect: (selected) => set((s) => (s.inside ? { inside: { ...s.inside, selected }, zoomLevel: selected && s.zoomLevel < 4 && s.zoomLevel === 3 ? 4 : s.zoomLevel } : {})),
  exitInside: () => set({ inside: null, zoomLevel: 1 }),
  setAutoZoom: (autoZoom) => {
    writePref("atlas-autozoom", autoZoom ? "on" : "off");
    set({ autoZoom });
  },
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setWalk: (w) => set((s) => ({ walk: { ...s.walk, ...w } })),
  setLoaded: (arch, scales) => set({ original: arch, arch, computed: computeArchitecture(arch), scales, selectedId: null, hoveredId: null, inside: null, zoomLevel: 1, walk: { active: false, step: 0, playing: false, speed: 1.6 } }),
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
