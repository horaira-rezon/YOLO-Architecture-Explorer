import type { Architecture, ComputeResult, Stage } from "@yolo-atlas/core";
import { formatShape, getBlock, levelLabel, summarizeArgs } from "@yolo-atlas/core";

export type DisplayKind = "layer" | "input" | "post" | "train";

export interface DisplayNode {
  id: string;
  kind: DisplayKind;
  stage: Stage;
  title: string;
  subtitle: string;
  index: number | null;
  shape: number[] | null;
  level: string | null;
  /** Down-sampling factor of the output map (1 for the image). */
  stride: number | null;
  error: boolean;
  /** Architecture node id (layers only). */
  nodeId?: string;
  module?: string;
  trainingOnly?: boolean;
}

export interface DisplayEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  /** Skip / lateral connection (not from the layer right before). */
  skip: boolean;
  kind: "data" | "train";
}

export interface DisplayGraph {
  nodes: DisplayNode[];
  edges: DisplayEdge[];
}

export const STAGE_ORDER: Stage[] = ["input", "backbone", "neck", "head", "postprocess", "loss"];

/** Turn an architecture into the boxes and arrows shown on the canvas (adds input / post-processing / training items). */
export function buildDisplayGraph(arch: Architecture, comp: ComputeResult): DisplayGraph {
  const nodes: DisplayNode[] = [];
  const edges: DisplayEdge[] = [];
  const inShape = [arch.inputChannels, arch.inputSize, arch.inputSize];
  nodes.push({ id: "input", kind: "input", stage: "input", title: "Image", subtitle: `${arch.inputSize}×${arch.inputSize} RGB`, index: null, shape: inShape, level: null, stride: 1, error: false });

  const live = arch.nodes.filter((n) => n.origin !== "removed-ghost");
  for (const n of live) {
    const c = comp.nodes[n.id];
    const def = getBlock(n.module);
    nodes.push({
      id: n.id, kind: "layer", stage: n.stage, title: def?.displayName ?? n.module, subtitle: summarizeArgs(n, c),
      index: c?.index ?? null, shape: c?.outShape ?? null, level: levelLabel(c?.stride ?? null), stride: c?.stride ?? null,
      error: comp.issues.some((i) => i.nodeId === n.id && i.severity === "error"), nodeId: n.id, module: n.module,
    });
    const sources = n.from.length === 0 ? ["input"] : n.from;
    sources.forEach((s, k) => {
      const sc = s === "input" ? null : comp.nodes[s];
      const shape = s === "input" ? inShape : sc?.outShape;
      const skip = s !== "input" && sc != null && c != null && sc.index !== c.index - 1;
      edges.push({ id: `${s}->${n.id}#${k}`, source: s, target: n.id, label: formatShape(shape), skip, kind: "data" });
    });
  }

  const heads = live.filter((n) => n.stage === "head");
  const last = heads[heads.length - 1] ?? live[live.length - 1];
  if (last) {
    if (arch.task === "classify") {
      nodes.push({ id: "post:softmax", kind: "post", stage: "postprocess", title: "Softmax → top class", subtitle: "probabilities", index: null, shape: null, level: null, stride: null, error: false });
      edges.push({ id: `${last.id}->post:softmax`, source: last.id, target: "post:softmax", label: formatShape(comp.nodes[last.id]?.outShape), skip: false, kind: "data" });
    } else {
      const pp = arch.postprocess;
      nodes.push({ id: "post:conf", kind: "post", stage: "postprocess", title: "Confidence filter", subtitle: `keep score ≥ ${pp.confThreshold}`, index: null, shape: null, level: null, stride: null, error: false });
      nodes.push(pp.nms
        ? { id: "post:nms", kind: "post", stage: "postprocess", title: "NMS", subtitle: `IoU ${pp.iouThreshold} · max ${pp.maxDet}`, index: null, shape: null, level: null, stride: null, error: false }
        : { id: "post:nms", kind: "post", stage: "postprocess", title: "No NMS (end-to-end)", subtitle: `top ${pp.maxDet} from one-to-one head`, index: null, shape: null, level: null, stride: null, error: false });
      edges.push({ id: `${last.id}->post:conf`, source: last.id, target: "post:conf", label: "predictions", skip: false, kind: "data" });
      edges.push({ id: "post:conf->post:nms", source: "post:conf", target: "post:nms", label: "", skip: false, kind: "data" });
    }
    const t = arch.training;
    if (t.assigner !== "none") {
      nodes.push({ id: "train:assigner", kind: "train", stage: "loss", title: "Assigner", subtitle: t.assigner, index: null, shape: null, level: null, stride: null, error: false, trainingOnly: true });
      edges.push({ id: `${last.id}->train:assigner`, source: last.id, target: "train:assigner", label: "training", skip: true, kind: "train" });
    }
    for (const l of t.losses) {
      nodes.push({ id: `train:loss:${l.id}`, kind: "train", stage: "loss", title: `${l.kind} loss`, subtitle: l.weight != null ? `weight ${l.weight}` : "", index: null, shape: null, level: null, stride: null, error: false, trainingOnly: true });
      edges.push({ id: `${t.assigner !== "none" ? "train:assigner" : last.id}->train:loss:${l.id}`, source: t.assigner !== "none" ? "train:assigner" : last.id, target: `train:loss:${l.id}`, label: "", skip: false, kind: "train" });
    }
  }
  return { nodes, edges };
}
