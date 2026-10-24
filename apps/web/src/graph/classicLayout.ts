import type { Stage } from "@yolo-atlas/core";
import type { DisplayGraph, DisplayNode } from "./displayGraph";
import { BAND_TITLE, NODE_SIZE, labelsFor, type Band, type Box, type LayoutResult, type Point } from "./layout";

/**
 * "Classic" YOLO layout: one row per feature-map size.
 * The backbone runs down the first column; the neck's top-down (FPN) and bottom-up (PAN) passes get their own
 * columns, with each node in the row of its map size; heads sit to the right of their inputs.
 * Computed in a "down" frame (rows top → bottom) and transposed for left-to-right.
 */
export function layoutClassic(g: DisplayGraph, direction: "DOWN" | "RIGHT"): LayoutResult {
  const down = direction === "DOWN";
  // sizes in the abstract (down) frame
  const size = (n: DisplayNode) => {
    const s = NODE_SIZE[n.kind];
    return down ? { w: s.w, h: s.h } : { w: s.h, h: s.w };
  };
  const W = down ? NODE_SIZE.layer.w : NODE_SIZE.layer.h;
  const H = down ? NODE_SIZE.layer.h : NODE_SIZE.layer.w;
  const GX = down ? 56 : 40, GY = down ? 34 : 48;
  const colW = W + GX, rowH = H + GY;
  const PAD = 56;
  // rows after the input row are pushed down so the input band and the backbone band (with its title strip) never touch
  const STAGE_GAP = down ? BAND_TITLE + 30 : 0;
  const yOf = (r: number) => PAD + r * rowH + (r >= 1 ? STAGE_GAP : 0);

  const boxes: Record<string, Box> = {};
  const place = (n: DisplayNode, x: number, y: number) => {
    const s = size(n);
    boxes[n.id] = { x: x + (W - s.w) / 2, y: y + (H - s.h) / 2, w: s.w, h: s.h };
  };
  const byIndex = (a: DisplayNode, b: DisplayNode) => (a.index ?? 0) - (b.index ?? 0);
  const layers = g.nodes.filter((n) => n.kind === "layer");

  // --- column 0: input + backbone, one row each
  const input = g.nodes.find((n) => n.kind === "input");
  const backbone = layers.filter((n) => n.stage === "backbone").sort(byIndex);
  let row = 0;
  if (input) place(input, PAD, yOf(row++));
  const rowOfStride = new Map<number, number>([[1, 0]]);
  for (const n of backbone) {
    place(n, PAD, yOf(row));
    if (n.stride) rowOfStride.set(n.stride, row);
    row++;
  }
  const lastRow = Math.max(row - 1, 0);
  const strides = [...rowOfStride.keys()].sort((a, b) => a - b);
  const rowFor = (stride: number | null): number => {
    if (stride == null) return lastRow;
    const exact = rowOfStride.get(stride);
    if (exact !== undefined) return exact;
    // closest known map size (e.g. a new P6 level beyond the backbone)
    let best = strides[strides.length - 1]!;
    for (const s of strides) if (Math.abs(Math.log2(s) - Math.log2(stride)) < Math.abs(Math.log2(best) - Math.log2(stride))) best = s;
    return (rowOfStride.get(best) ?? lastRow) + (stride > best ? 1 : 0);
  };

  // --- neck: phases split where the map size changes direction (top-down → bottom-up → …)
  const neck = layers.filter((n) => n.stage === "neck").sort(byIndex);
  const cells = new Map<string, DisplayNode[]>();
  const phaseOf = new Map<string, number>();
  let phase = 0, prevStride = backbone[backbone.length - 1]?.stride ?? null, trend = 0;
  for (const n of neck) {
    const s = n.stride ?? prevStride;
    if (s != null && prevStride != null && s !== prevStride) {
      const t = s < prevStride ? -1 : 1;
      if (trend !== 0 && t !== trend) phase++;
      trend = t;
    }
    if (s != null) prevStride = s;
    phaseOf.set(n.id, phase);
    const key = `${phase}|${rowFor(s)}`;
    cells.set(key, [...(cells.get(key) ?? []), n]);
  }
  const phases = phase + 1;
  const phaseWidth = Array.from({ length: phases }, (_, p) =>
    Math.max(1, ...[...cells.entries()].filter(([k]) => k.startsWith(`${p}|`)).map(([, v]) => v.length)));
  let x = PAD + colW + GX;
  const phaseX: number[] = [];
  for (let p = 0; p < phases; p++) {
    phaseX.push(x);
    if (neck.length) x += phaseWidth[p]! * colW + GX;
  }
  for (const [key, list] of cells) {
    const [p, r] = key.split("|").map(Number) as [number, number];
    list.forEach((n, k) => place(n, phaseX[p]! + k * colW, yOf(r)));
  }

  // --- heads: right of the neck, vertically centred on their inputs
  const incoming = new Map<string, string[]>();
  for (const e of g.edges) incoming.set(e.target, [...(incoming.get(e.target) ?? []), e.source]);
  const headX = neck.length ? x : PAD + colW + GX;
  const heads = layers.filter((n) => n.stage === "head").sort(byIndex);
  let headBottom = PAD;
  heads.forEach((n, k) => {
    const ys = (incoming.get(n.id) ?? []).map((s) => boxes[s]).filter(Boolean).map((b) => b!.y + b!.h / 2);
    const cy = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : yOf(lastRow) + H / 2;
    place(n, headX, Math.max(cy - H / 2, headBottom) + k * 0);
    headBottom = boxes[n.id]!.y + rowH;
  });

  // --- after the model: inference post-processing, then training-only items, in a column
  const tailX = headX + (heads.length ? colW + GX : 0);
  const anchorY = heads.length ? boxes[heads[0]!.id]!.y : PAD;
  const post = g.nodes.filter((n) => n.kind === "post");
  const train = g.nodes.filter((n) => n.kind === "train");
  post.forEach((n, k) => place(n, tailX, anchorY + k * rowH));
  train.forEach((n, k) => place(n, tailX, anchorY + (post.length + 1 + k) * rowH));

  // anything not placed (unknown stage) goes under the backbone
  let spare = row + 1;
  for (const n of g.nodes) if (!boxes[n.id]) place(n, PAD, yOf(spare++));

  // route in the abstract frame, then transpose; bands and labels are computed in the real frame
  let routed = { boxes, edges: routeEdges(g, boxes) };
  if (!down) routed = transposeBoxes(routed);
  const bands = stageBands(g, routed.boxes);
  const all = [...Object.values(routed.boxes), ...bands];
  return {
    boxes: routed.boxes, edges: routed.edges, bands, labels: labelsFor(g, routed.boxes, routed.edges, bands),
    width: Math.max(...all.map((b) => b.x + b.w)) + PAD, height: Math.max(...all.map((b) => b.y + b.h)) + PAD,
  };
}

/** Orthogonal routes: straight down a column, steps between columns, and an over-the-row lane for long laterals. */
function routeEdges(g: DisplayGraph, boxes: Record<string, Box>): Record<string, Point[]> {
  const out: Record<string, Point[]> = {};
  const all = Object.entries(boxes);
  const laneUse = new Map<number, number>();
  for (const e of g.edges) {
    const s = boxes[e.source], t = boxes[e.target];
    if (!s || !t) continue;
    const scx = s.x + s.w / 2, scy = s.y + s.h / 2, tcx = t.x + t.w / 2, tcy = t.y + t.h / 2;
    const sameCol = Math.abs(scx - tcx) < 2;
    if (sameCol && t.y > s.y) {
      out[e.id] = [{ x: scx, y: s.y + s.h }, { x: tcx, y: t.y }];
      continue;
    }
    if (t.x >= s.x + s.w || t.x + t.w <= s.x) {
      const right = t.x >= s.x + s.w;
      const sx = right ? s.x + s.w : s.x, tx = right ? t.x : t.x + t.w;
      const blocked = all.some(([id, b]) => id !== e.source && id !== e.target &&
        b.x > Math.min(sx, tx) - 1 && b.x + b.w < Math.max(sx, tx) + 1 &&
        Math.min(scy, tcy) < b.y + b.h + 4 && Math.max(scy, tcy) > b.y - 4);
      if (!blocked) {
        const mx = (sx + tx) / 2;
        out[e.id] = Math.abs(scy - tcy) < 1 ? [{ x: sx, y: scy }, { x: tx, y: tcy }] : [{ x: sx, y: scy }, { x: mx, y: scy }, { x: mx, y: tcy }, { x: tx, y: tcy }];
      } else {
        // go through the gap above the target's row; offset lanes so parallel edges do not overlap
        const laneKey = Math.round(t.y);
        const used = laneUse.get(laneKey) ?? 0;
        laneUse.set(laneKey, used + 1);
        const ly = t.y - 10 - (used % 3) * 5;
        const d = right ? 1 : -1;
        out[e.id] = [
          { x: sx, y: scy }, { x: sx + d * (14 + used * 4), y: scy }, { x: sx + d * (14 + used * 4), y: ly },
          { x: tx - d * 14, y: ly }, { x: tx - d * 14, y: tcy }, { x: tx, y: tcy },
        ];
      }
      continue;
    }
    // same column, target above (rare: hand-made loops are rejected, but rewired graphs can do this)
    const ox = Math.max(s.x + s.w, t.x + t.w) + 20;
    out[e.id] = [{ x: s.x + s.w, y: scy }, { x: ox, y: scy }, { x: ox, y: tcy }, { x: t.x + t.w, y: tcy }];
  }
  return out;
}

function stageBands(g: DisplayGraph, boxes: Record<string, Box>): Band[] {
  const pad = 20;
  const by = new Map<Stage, Box[]>();
  for (const n of g.nodes) {
    const b = boxes[n.id];
    if (b) by.set(n.stage, [...(by.get(n.stage) ?? []), b]);
  }
  return [...by.entries()].map(([stage, bs]) => {
    const x0 = Math.min(...bs.map((b) => b.x)) - pad, x1 = Math.max(...bs.map((b) => b.x + b.w)) + pad;
    const y0 = Math.min(...bs.map((b) => b.y)) - pad - BAND_TITLE, y1 = Math.max(...bs.map((b) => b.y + b.h)) + pad;
    return { stage, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  });
}

function transposeBoxes(r: { boxes: Record<string, Box>; edges: Record<string, Point[]> }) {
  const tb = (b: Box): Box => ({ x: b.y, y: b.x, w: b.h, h: b.w });
  return {
    boxes: Object.fromEntries(Object.entries(r.boxes).map(([k, b]) => [k, tb(b)])),
    edges: Object.fromEntries(Object.entries(r.edges).map(([k, ps]) => [k, ps.map((p) => ({ x: p.y, y: p.x }))])),
  };
}
