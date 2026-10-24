import type { Architecture } from "../schema";
import { getBlock } from "../blocks/registry";
import type { ComputeResult, Issue } from "./compute";
import { formatShape } from "../describe";

/**
 * All problems with an architecture, in plain words, most serious first. Adds graph-level checks to the
 * per-layer ones from the engine and attaches one-click fixes where there is an obvious one.
 */
export function validate(arch: Architecture, comp: ComputeResult): Issue[] {
  const issues: Issue[] = comp.issues.map((i) => ({ ...i }));
  const live = arch.nodes.filter((n) => n.origin !== "removed-ghost");
  const heads = live.filter((n) => getBlock(n.module)?.isHead);
  if (heads.length === 0) issues.push({ nodeId: null, severity: "error", code: "no-head", message: "There is no head, so the model makes no predictions. Add a head as the last layer." });
  if (heads.length > 1) issues.push({ nodeId: heads[1]!.id, severity: "error", code: "two-heads", message: "There is more than one head. Ultralytics expects exactly one head, as the last layer." });
  const last = live[live.length - 1];
  if (heads[0] && last && heads[0].id !== last.id) issues.push({ nodeId: heads[0].id, severity: "error", code: "head-not-last", message: "The head must be the last layer.", suggestedFix: { label: "Move the head to the end", ops: [{ op: "moveNode", nodeId: heads[0].id, after: last.id }] } });

  for (const h of heads) {
    const strides = h.from.map((f) => comp.nodes[f]?.stride ?? null);
    h.from.forEach((f, k) => {
      const s = comp.nodes[f]?.outShape;
      if (s && s.length !== 3 && getBlock(h.module)?.id !== "Classify") issues.push({ nodeId: h.id, severity: "error", code: "head-input", message: `Head input ${k + 1} is not a feature map (${formatShape(s)}).` });
    });
    const sorted = [...strides].sort((a, b) => (a ?? 0) - (b ?? 0));
    if (strides.some((s, i) => s !== sorted[i])) issues.push({ nodeId: h.id, severity: "warning", code: "head-order", message: "Head inputs are usually listed from the most detailed map (smallest stride) to the coarsest." });
    if (new Set(strides).size !== strides.length) issues.push({ nodeId: h.id, severity: "warning", code: "head-duplicate-level", message: "Two head inputs have the same map size, so they cover the same object sizes." });
  }

  // concat with a ×2 size mismatch: offer Upsample / stride-2 Conv
  for (const n of live) {
    if (getBlock(n.module)?.id !== "Concat") continue;
    const ins = n.from.map((f) => ({ id: f, s: comp.nodes[f]?.outShape }));
    if (ins.some((i) => !i.s || i.s.length !== 3)) continue;
    const target = Math.max(...ins.map((i) => i.s![1]!));
    for (const i of ins) {
      if (i.s![1]! * 2 === target) {
        issues.forEach((x) => { if (x.nodeId === n.id && x.code === "build-failed") x.suggestedFix = { label: `Insert an Upsample after layer ${comp.nodes[i.id]?.index}`, ops: [{ op: "insertNode", after: i.id, node: { module: "nn.Upsample", args: ["None", 2, "nearest"], repeats: 1 }, rewire: [n.id] }] }; });
      }
    }
  }

  // outputs nobody uses
  for (const n of live) {
    if (getBlock(n.module)?.isHead || n === last) continue;
    if (!(comp.consumers[n.id] ?? []).length) issues.push({
      nodeId: n.id, severity: "warning", code: "unused",
      message: "Nothing uses this block's output, so it only adds cost.",
      suggestedFix: { label: "Delete it", ops: [{ op: "deleteNode", nodeId: n.id, mode: "bridge" }] },
    });
  }

  if (arch.inputSize % 32 !== 0) issues.push({ nodeId: null, severity: "error", code: "input-size", message: "The input size should be a multiple of 32." });
  const order = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}
