import { getBlock } from "@yolo-atlas/core";
import { useAtlas } from "../store/atlas";
import { applyOps } from "../store/lab";
import { PRESETS, nodeSpec, type PaletteItem } from "./labDefaults";

export const DRAG_TYPE = "application/x-yolo-atlas-block";

/** Insert after the selected layer (or before the head when nothing is selected). */
export function insertItem(item: PaletteItem, afterId?: string): void {
  const st = useAtlas.getState();
  if (!st.arch) return;
  const live = st.arch.nodes;
  const after = afterId ?? (st.selectedId && live.some((n) => n.id === st.selectedId) ? st.selectedId : live[live.length - 2]?.id);
  if (!after) return;
  const near = live.find((n) => n.id === after);
  const r = applyOps([{ op: "insertNode", after, node: nodeSpec(item, near, st.computed) }], `Insert ${item.label}`);
  if (!r) {
    const added = useAtlas.getState().arch!.nodes.find((n, i) => i === live.findIndex((x) => x.id === after) + 1);
    if (added) useAtlas.getState().select(added.id);
  }
}

export function paletteItemByKey(key: string): PaletteItem | undefined {
  const preset = PRESETS.find((p) => p.key === key);
  if (preset) return preset;
  const b = getBlock(key);
  return b ? { key: b.id, label: b.displayName, module: b.yamlName, hint: "" } : undefined;
}
