import type { Box, Point } from "./layout";

/** Rectangle covered by a band's title chip (top-left of the band). */
export function titleRect(band: Box, title: string): Box {
  return { x: band.x + 6, y: band.y + 6, w: 34 + title.length * 7.8, h: 24 };
}

const hit = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Put each edge's size label somewhere it does not cover a node, a band title or another label:
 * beside vertical segments, above horizontal ones, trying several spots along the longest segments first.
 * Edges with no free spot get no entry; the source node already shows the same shape.
 */
export function placeLabels(edges: Record<string, Point[]>, texts: Record<string, string>, boxes: Box[], titles: Box[]): Record<string, Point> {
  const obstacles = [...boxes.map((b) => ({ x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 })), ...titles];
  const placed: Box[] = [];
  const out: Record<string, Point> = {};
  // long edges first: they have the most room to move
  const ids = Object.keys(edges).filter((id) => texts[id]).sort((a, b) => edges[b]!.length - edges[a]!.length);
  for (const id of ids) {
    const pts = edges[id]!;
    const w = texts[id]!.length * 6.2 + 8, h = 14;
    const segs = pts.slice(1).map((p, i) => ({ a: pts[i]!, b: p, len: Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y) })).sort((s, t) => t.len - s.len);
    let best: Point | null = null;
    outer: for (const s of segs) {
      if (s.len < 24) continue;
      const vertical = Math.abs(s.a.x - s.b.x) < Math.abs(s.a.y - s.b.y);
      for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
        const x = s.a.x + (s.b.x - s.a.x) * t, y = s.a.y + (s.b.y - s.a.y) * t;
        const c = vertical ? { x: x + w / 2 + 5, y } : { x, y: y - h / 2 - 3 };
        const r = { x: c.x - w / 2, y: c.y - h / 2, w, h };
        if (!obstacles.some((o) => hit(o, r)) && !placed.some((o) => hit(o, r))) {
          best = c;
          placed.push(r);
          break outer;
        }
      }
    }
    // no free spot (very short link between neighbours): no permanent label; the edge shows it while highlighted
    if (best) out[id] = best;
  }
  return out;
}
