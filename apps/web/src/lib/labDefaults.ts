import { getBlock, type ArchNode, type BlockDefinition, type ComputeResult, type NewNode, type YamlValue } from "@yolo-atlas/core";

/** YAML-level channel count of a node (before the width multiplier), used to pre-fill new blocks. */
export function yamlChannels(node: ArchNode | undefined, comp: ComputeResult | null): number {
  if (!node) return 256;
  const def = getBlock(node.module);
  if (def?.parse === "base" && typeof node.args[0] === "number") return node.args[0];
  const c2 = comp?.nodes[node.id]?.c2;
  const w = comp?.scaleRow.width ?? 1;
  return c2 ? Math.round(c2 / w / 8) * 8 || 8 : 256;
}

/** Sensible YAML args for a new block placed after `near`. */
export function defaultArgs(def: BlockDefinition, near: ArchNode | undefined, comp: ComputeResult | null): YamlValue[] {
  const out: YamlValue[] = [];
  for (const a of def.args) {
    if (a.kind === "channels") out.push(yamlChannels(near, comp));
    else if (a.kind === "nc") out.push("nc");
    else if (a.kind === "kpt") out.push("kpt_shape");
    else out.push(a.default === undefined ? null : a.default);
  }
  // drop trailing nulls so YAML stays short
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}

export interface PaletteItem {
  key: string;
  label: string;
  module: string;
  /** Preset args (otherwise defaults are used). */
  args?: (near: ArchNode | undefined, comp: ComputeResult | null) => YamlValue[];
  repeats?: number;
  hint: string;
}

/** Ready-made variants of standard blocks. */
export const PRESETS: PaletteItem[] = [
  { key: "dilated", label: "Dilated Conv (d=2)", module: "Conv", hint: "3×3 Conv with dilation 2: sees a 5×5 area at 3×3 cost.", args: (n, c) => [yamlChannels(n, c), 3, 1, "None", 1, 2] },
  { key: "conv1x1", label: "1×1 Conv (change channels)", module: "Conv", hint: "Cheap channel mixing / matching.", args: (n, c) => [yamlChannels(n, c), 1, 1] },
  { key: "conv-s2", label: "Stride-2 Conv (downsample)", module: "Conv", hint: "Halves the map size.", args: (n, c) => [yamlChannels(n, c), 3, 2] },
  { key: "upsample", label: "Upsample ×2", module: "nn.Upsample", hint: "Doubles the map size.", args: () => ["None", 2, "nearest"] },
];

export function nodeSpec(item: PaletteItem, near: ArchNode | undefined, comp: ComputeResult | null): NewNode {
  const def = getBlock(item.module)!;
  return { module: def.yamlName, args: item.args ? item.args(near, comp) : defaultArgs(def, near, comp), repeats: item.repeats ?? 1 };
}
