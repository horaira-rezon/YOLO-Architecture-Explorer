import ELK, { type ElkNode, type ElkExtendedEdge } from "elkjs/lib/elk-api.js";
import elkWorkerUrl from "elkjs/lib/elk-worker.min.js?url";
import type { Stage } from "@yolo-atlas/core";
import type { DisplayGraph, DisplayKind } from "./displayGraph";

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Band extends Box {
  stage: Stage;
}

export interface LayoutResult {
  boxes: Record<string, Box>;
  edges: Record<string, Point[]>;
  bands: Band[];
  width: number;
  height: number;
}

export const NODE_SIZE: Record<DisplayKind, { w: number; h: number }> = {
  layer: { w: 220, h: 72 },
  input: { w: 200, h: 60 },
  post: { w: 190, h: 56 },
  train: { w: 190, h: 56 },
};

const PARTITION: Record<Stage, number> = { input: 0, backbone: 1, neck: 2, head: 3, postprocess: 4, loss: 4 };

let elk: InstanceType<typeof ELK> | null = null;
function getElk() {
  // Layout runs in a web worker so the page stays responsive on large graphs
  elk ??= new ELK({ workerFactory: () => new Worker(elkWorkerUrl) });
  return elk;
}

export async function layoutGraph(g: DisplayGraph, direction: "DOWN" | "RIGHT"): Promise<LayoutResult> {
  const children: ElkNode[] = g.nodes.map((n) => ({
    id: n.id,
    width: NODE_SIZE[n.kind].w,
    height: NODE_SIZE[n.kind].h,
    layoutOptions: { "elk.partitioning.partition": String(PARTITION[n.stage]) },
  }));
  const edges: ElkExtendedEdge[] = g.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] }));
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.partitioning.activate": "true",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.spacing.nodeNodeBetweenLayers": "56",
      "elk.spacing.nodeNode": "36",
      "elk.layered.spacing.edgeNodeBetweenLayers": "20",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.crossingMinimization.semiInteractive": "true",
      "elk.padding": "[top=48,left=48,bottom=48,right=48]",
    },
    children,
    edges,
  };
  const root = await getElk().layout(graph);

  const boxes: Record<string, Box> = {};
  for (const c of root.children ?? []) boxes[c.id] = { x: c.x ?? 0, y: c.y ?? 0, w: c.width ?? 0, h: c.height ?? 0 };
  const edgePts: Record<string, Point[]> = {};
  for (const e of (root.edges ?? []) as ElkExtendedEdge[]) {
    const s = e.sections?.[0];
    if (s) edgePts[e.id] = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint];
  }
  return { boxes, edges: edgePts, bands: computeBands(g, boxes, direction), width: root.width ?? 0, height: root.height ?? 0 };
}

function computeBands(g: DisplayGraph, boxes: Record<string, Box>, direction: "DOWN" | "RIGHT"): Band[] {
  const pad = 22;
  const all = Object.values(boxes);
  if (!all.length) return [];
  const minX = Math.min(...all.map((b) => b.x)) - pad * 2;
  const maxX = Math.max(...all.map((b) => b.x + b.w)) + pad * 2;
  const minY = Math.min(...all.map((b) => b.y)) - pad * 2;
  const maxY = Math.max(...all.map((b) => b.y + b.h)) + pad * 2;
  const byStage = new Map<Stage, Box[]>();
  for (const n of g.nodes) {
    const b = boxes[n.id];
    if (!b) continue;
    byStage.set(n.stage, [...(byStage.get(n.stage) ?? []), b]);
  }
  const bands: Band[] = [];
  for (const [stage, bs] of byStage) {
    const x0 = Math.min(...bs.map((b) => b.x)) - pad, x1 = Math.max(...bs.map((b) => b.x + b.w)) + pad;
    const y0 = Math.min(...bs.map((b) => b.y)) - pad - 18, y1 = Math.max(...bs.map((b) => b.y + b.h)) + pad;
    const shared = stage === "postprocess" || stage === "loss";
    if (shared) bands.push({ stage, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    else if (direction === "DOWN") bands.push({ stage, x: minX, y: y0, w: maxX - minX, h: y1 - y0 });
    else bands.push({ stage, x: x0, y: minY - 18, w: x1 - x0, h: maxY - minY + 18 });
  }
  return bands;
}

/** Plain ELK layered layout for small graphs (block internals). */
export async function layoutPlain(
  items: { id: string; w: number; h: number }[],
  edges: { id: string; source: string; target: string }[],
  direction: "DOWN" | "RIGHT",
): Promise<{ boxes: Record<string, Box>; edges: Record<string, Point[]> }> {
  const root = await getElk().layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.spacing.nodeNodeBetweenLayers": "40",
      "elk.spacing.nodeNode": "28",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.padding": "[top=32,left=32,bottom=32,right=32]",
    },
    children: items.map((i) => ({ id: i.id, width: i.w, height: i.h })),
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  });
  const boxes: Record<string, Box> = {};
  for (const c of root.children ?? []) boxes[c.id] = { x: c.x ?? 0, y: c.y ?? 0, w: c.width ?? 0, h: c.height ?? 0 };
  const out: Record<string, Point[]> = {};
  for (const e of (root.edges ?? []) as ElkExtendedEdge[]) {
    const sec = e.sections?.[0];
    if (sec) out[e.id] = [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint];
  }
  return { boxes, edges: out };
}
