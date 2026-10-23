import type { ArchNode } from "./schema";
import type { NodeComputed } from "./engine/compute";
import { getBlock } from "./blocks/registry";

/** Short, plain summary of a layer's settings for node cards, e.g. "128 ch · ×2 · shortcut". */
export function summarizeArgs(node: ArchNode, c: NodeComputed | undefined): string {
  const def = getBlock(node.module);
  const parts: string[] = [];
  if (!def) return node.args.map(String).join(", ");
  if (def.parse === "base") {
    if (c?.c2) parts.push(`${c.c2} ch`);
    const k = def.args.findIndex((a) => a.name === "k");
    const s = def.args.findIndex((a) => a.name === "s");
    const kv = k >= 0 ? node.args[k] : undefined;
    const sv = s >= 0 ? node.args[s] : undefined;
    if (typeof kv === "number" && def.category === "conv") parts.push(`${kv}×${kv}`);
    if (typeof sv === "number" && sv > 1) parts.push(`stride ${sv}`);
    if (def.repeatModule && c && c.nEff > 1) parts.push(`×${c.nEff}`);
    def.args.forEach((a, i) => {
      if (a.kind === "bool" && node.args[i] === true) parts.push(a.name);
    });
  } else if (def.id === "Upsample") parts.push(`×${node.args[1] ?? 2}`);
  else if (def.id === "Concat") parts.push(`${node.from.length} inputs`);
  else if (def.isHead) parts.push(`${node.from.length} levels`);
  if (!def.repeatModule && c && c.nEff > 1) parts.push(`×${c.nEff}`);
  return parts.join(" · ");
}

/** "P3/8" style label from a stride. */
export function levelLabel(stride: number | null): string | null {
  if (!stride || !Number.isInteger(Math.log2(stride))) return null;
  return `P${Math.log2(stride)}/${stride}`;
}

export function formatShape(s: number[] | null | undefined): string {
  return s ? s.join("×") : "?";
}

export function formatCount(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} K`;
  return String(n);
}
