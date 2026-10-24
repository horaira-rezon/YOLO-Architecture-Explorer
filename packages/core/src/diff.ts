import type { ArchNode, Architecture, Stage } from "./schema";
import type { ComputeResult } from "./engine/compute";
import { getBlock } from "./blocks/registry";

export type DiffKind = "added" | "removed" | "changed" | "same";

export interface NodeDiff {
  kind: DiffKind;
  a?: ArchNode;
  b?: ArchNode;
  /** Plain-language list of what differs (for "changed"). */
  changes: string[];
}

const blockName = (m: string) => getBlock(m)?.displayName ?? m;

function describeChanges(a: ArchNode, b: ArchNode, ca?: ComputeResult, cb?: ComputeResult): string[] {
  const out: string[] = [];
  if (a.module !== b.module) out.push(`block ${blockName(a.module)} → ${blockName(b.module)}`);
  if (JSON.stringify(a.args) !== JSON.stringify(b.args)) out.push(`settings ${JSON.stringify(a.args)} → ${JSON.stringify(b.args)}`);
  if (a.repeats !== b.repeats) out.push(`repeats ${a.repeats} → ${b.repeats}`);
  const sa = ca?.nodes[a.id]?.outShape, sb = cb?.nodes[b.id]?.outShape;
  if (sa && sb && sa.join("×") !== sb.join("×")) out.push(`output ${sa.join("×")} → ${sb.join("×")}`);
  return out;
}

/** Diff of two versions of the *same* graph (Lab edits): nodes matched by their stable id. */
export function diffById(a: Architecture, b: Architecture, ca?: ComputeResult, cb?: ComputeResult): NodeDiff[] {
  const inA = new Map(a.nodes.map((n) => [n.id, n]));
  const inB = new Map(b.nodes.filter((n) => n.origin !== "removed-ghost").map((n) => [n.id, n]));
  const out: NodeDiff[] = [];
  for (const n of b.nodes) {
    if (n.origin === "removed-ghost") continue;
    const old = inA.get(n.id);
    if (!old) out.push({ kind: "added", b: n, changes: [] });
    else {
      const changes = describeChanges(old, n, ca, cb);
      const fromChanged = JSON.stringify(old.from) !== JSON.stringify(n.from);
      if (fromChanged) changes.push("inputs rewired");
      out.push({ kind: changes.length ? "changed" : "same", a: old, b: n, changes });
    }
  }
  for (const n of a.nodes) if (!inB.has(n.id)) out.push({ kind: "removed", a: n, changes: [] });
  return out;
}

/** Longest-common-subsequence alignment of two node lists by block type. */
function align(xs: ArchNode[], ys: ArchNode[]): [ArchNode | undefined, ArchNode | undefined][] {
  const key = (n: ArchNode) => getBlock(n.module)?.id ?? n.module;
  const m = xs.length, n = ys.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i]![j] = key(xs[i]!) === key(ys[j]!) ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const pairs: [ArchNode | undefined, ArchNode | undefined][] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (key(xs[i]!) === key(ys[j]!)) pairs.push([xs[i++], ys[j++]]);
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      // a block replaced by another at the same spot reads better as "changed" than remove + add
      if (dp[i + 1]![j + 1]! === dp[i]![j]! && xs[i]!.stage === ys[j]!.stage) pairs.push([xs[i++], ys[j++]]);
      else pairs.push([xs[i++], undefined]);
    } else pairs.push([undefined, ys[j++]]);
  }
  while (i < m) pairs.push([xs[i++], undefined]);
  while (j < n) pairs.push([undefined, ys[j++]]);
  return pairs;
}

/** Diff of two *different* architectures (version compare): layers aligned stage by stage. */
export function diffAligned(a: Architecture, b: Architecture, ca?: ComputeResult, cb?: ComputeResult): NodeDiff[] {
  const stages: Stage[] = ["backbone", "neck", "head"];
  const out: NodeDiff[] = [];
  for (const s of stages) {
    for (const [x, y] of align(a.nodes.filter((n) => n.stage === s), b.nodes.filter((n) => n.stage === s))) {
      if (x && y) {
        const changes = describeChanges(x, y, ca, cb);
        out.push({ kind: changes.length ? "changed" : "same", a: x, b: y, changes });
      } else if (y) out.push({ kind: "added", b: y, changes: [] });
      else out.push({ kind: "removed", a: x, changes: [] });
    }
  }
  return out;
}

export interface CompareSummary {
  newBlocks: string[];
  droppedBlocks: string[];
  counts: Record<DiffKind, number>;
}

export function compareSummary(diff: NodeDiff[], a: Architecture, b: Architecture): CompareSummary {
  const ids = (arch: Architecture) => new Set(arch.nodes.map((n) => getBlock(n.module)?.id ?? n.module));
  const ia = ids(a), ib = ids(b);
  const counts = { added: 0, removed: 0, changed: 0, same: 0 } as Record<DiffKind, number>;
  for (const d of diff) counts[d.kind]++;
  return { newBlocks: [...ib].filter((x) => !ia.has(x)), droppedBlocks: [...ia].filter((x) => !ib.has(x)), counts };
}
