import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from "@xyflow/react";
import type { Point } from "../../graph/layout";
import { useHighlight } from "../../store/highlight";
import { useWalkEdges } from "../../store/walk";

const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export type ElkEdgeData = { points: Point[]; label: string; skip: boolean; kind: "data" | "train"; labelAt?: Point };

/** Orthogonal path through ELK's bend points, with rounded corners. */
function roundedPath(pts: Point[], r = 8): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1]!, c = pts[i]!, n = pts[i + 1]!;
    const d1 = Math.hypot(c.x - p.x, c.y - p.y), d2 = Math.hypot(n.x - c.x, n.y - c.y);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const a = { x: c.x - ((c.x - p.x) / d1) * rr, y: c.y - ((c.y - p.y) / d1) * rr };
    const b = { x: c.x + ((n.x - c.x) / d2) * rr, y: c.y + ((n.y - c.y) / d2) * rr };
    d += ` L ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`;
  }
  const last = pts[pts.length - 1]!;
  return `${d} L ${last.x} ${last.y}`;
}

function labelPoint(pts: Point[]): Point {
  // middle of the longest segment keeps labels off the corners
  let best = 0, at = { x: 0, y: 0 };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > best) {
      best = len;
      at = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }
  return at;
}

function ElkEdgeImpl({ id, data, sourceX, sourceY, targetX, targetY, markerEnd }: EdgeProps<Edge<ElkEdgeData>>) {
  const pts = data?.points?.length ? data.points : [{ x: sourceX, y: sourceY }, { x: targetX, y: targetY }];
  const hl = useHighlight((s) => s.set);
  const dim = hl ? !hl.has(id) : false;
  const strong = hl ? hl.has(id) : false;
  // labels without a free spot (data.labelAt missing) only appear while the edge is highlighted
  const lp = data?.labelAt ?? labelPoint(pts);
  const showLabel = !!data?.label && !dim && (!!data.labelAt || strong || !data.points?.length);
  const walking = useWalkEdges((s) => s.ids.has(id));
  const seconds = useWalkEdges((s) => s.seconds);
  const path = roundedPath(pts);
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: data?.kind === "train" ? "var(--stage-loss)" : strong ? "var(--accent)" : "var(--muted)",
          strokeWidth: strong ? 2.2 : 1.4,
          strokeDasharray: data?.skip || data?.kind === "train" ? "6 4" : undefined,
          opacity: dim ? 0.15 : 0.9,
        }}
      />
      {walking && !reduceMotion && (
        <circle r="6" fill="var(--accent)" aria-hidden>
          <animateMotion dur={`${Math.max(seconds * 0.8, 0.4)}s`} repeatCount="indefinite" path={path} />
        </circle>
      )}
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            className={`pointer-events-none absolute rounded px-1 font-mono text-[10px] ${data?.labelAt ? "bg-bg/90 text-muted" : "z-10 bg-surface text-fg shadow"}`}
            style={{ transform: `translate(-50%, -50%) translate(${lp.x}px, ${lp.y}px)` }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const ElkEdge = memo(ElkEdgeImpl);
