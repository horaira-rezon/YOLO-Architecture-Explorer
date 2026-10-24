import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { AlertTriangle, LogIn } from "lucide-react";
import { formatShape } from "@yolo-atlas/core";
import type { DisplayNode } from "../../graph/displayGraph";
import type { Band } from "../../graph/layout";
import { STAGE_CONTENT, STAGE_STYLE } from "../../lib/stages";
import { useAtlas } from "../../store/atlas";
import { useHighlight } from "../../store/highlight";

export type LayerNodeData = { d: DisplayNode; w: number; h: number; vertical: boolean };
export type BandNodeData = { band: Band };

/** Tiny square whose side shrinks with the stride, so learners see the map get smaller. */
export function MapSquare({ shape, max = 22 }: { shape: number[] | null; max?: number }) {
  if (!shape || shape.length !== 3) return null;
  const h = shape[1]!;
  // log scale: stride 2 → full size, each halving removes one step
  const side = Math.max(3, max - 4 * Math.max(0, Math.log2(320 / Math.max(h, 1))));
  return (
    <span className="inline-flex h-[22px] w-[22px] items-center justify-center" aria-hidden>
      <span className="block border border-current opacity-70" style={{ width: side, height: side }} />
    </span>
  );
}

function LayerNodeImpl({ id, data, selected }: NodeProps<Node<LayerNodeData>>) {
  const { d, w, h, vertical } = data;
  const dim = useHighlight((s) => (s.set ? !s.set.has(id) : false));
  const isSelected = useAtlas((s) => s.selectedId === id) || selected;
  const style = STAGE_STYLE[d.stage];
  const Icon = style.icon;
  const training = d.kind === "train";
  const diffView = useAtlas((s) => s.diffView);
  const lab = useAtlas((s) => s.mode === "lab");
  const inSelection = useAtlas((s) => s.selection.includes(id));
  const ghost = d.origin === "removed-ghost";
  const badge = diffView && d.origin && d.origin !== "builtin" ? d.origin : null;
  const label = d.kind === "layer"
    ? `Layer ${d.index}: ${d.title}. ${d.subtitle}. Output ${formatShape(d.shape)}. ${STAGE_CONTENT[d.stage].title}.`
    : `${d.title}. ${d.subtitle}. ${STAGE_CONTENT[d.stage].title}.`;
  return (
    <div
      role="group"
      aria-roledescription="layer"
      aria-label={label}
      aria-current={isSelected ? "true" : undefined}
      data-testid={`node-${id}`}
      className={`relative flex flex-col justify-between rounded-lg border bg-surface px-2.5 py-1.5 text-left text-fg shadow-sm transition-opacity ${
        training || ghost ? "border-dashed" : ""
      } ${isSelected || inSelection ? "ring-2 ring-accent" : ""} ${d.error ? "border-danger" : badge === "added" ? "border-ok" : badge === "modified" ? "border-warn" : ghost ? "border-danger" : "border-border"}`}
      style={{ width: w, height: h, opacity: dim ? 0.22 : ghost ? 0.55 : 1, borderLeft: `6px solid ${style.color}` }}
      data-origin={d.origin}
    >
      {badge && (
        <span className={`absolute -top-2 right-2 rounded px-1 text-[9px] font-bold uppercase ${badge === "added" ? "bg-ok text-white" : badge === "modified" ? "bg-warn text-white" : "bg-danger text-white"}`}>
          {badge === "added" ? "+ new" : badge === "modified" ? "✎ changed" : "− removed"}
        </span>
      )}
      <Handle type="target" position={vertical ? Position.Top : Position.Left} className={lab && !ghost ? "!h-2 !w-2 !bg-accent" : "!opacity-0"} isConnectable={lab && !ghost} />
      <div className="flex items-center gap-1.5 text-[13px] font-semibold leading-tight">
        {d.index != null && <span className="rounded bg-surface-2 px-1 font-mono text-[11px] text-muted">{d.index}</span>}
        <span className="truncate">{d.title}</span>
        {d.error && <AlertTriangle size={14} className="text-danger" aria-label="has a problem" />}
        <Icon size={14} className="ml-auto shrink-0" style={{ color: style.color }} aria-hidden />
        {d.kind === "layer" && d.nodeId && !ghost && (
          <button
            type="button"
            className="nodrag shrink-0 rounded p-0.5 text-muted hover:bg-surface-2 hover:text-fg"
            aria-hidden
            tabIndex={-1}
            title="Look inside (Enter)"
            data-testid={`enter-${id}`}
            onClick={(e) => {
              e.stopPropagation();
              useAtlas.getState().enter(d.nodeId!);
            }}
          >
            <LogIn size={13} />
          </button>
        )}
      </div>
      {d.subtitle && <div className="truncate text-[11px] text-muted">{d.subtitle}</div>}
      {d.kind === "layer" || d.kind === "input" ? (
        <div className="flex items-center gap-1.5 font-mono text-[11px]">
          <MapSquare shape={d.shape} />
          <span>{formatShape(d.shape)}</span>
          {d.level && <span className="ml-auto rounded-full border border-border px-1.5 text-[10px] text-muted">{d.level}</span>}
        </div>
      ) : (
        training && <div className="text-[10px] uppercase tracking-wide text-muted">training only</div>
      )}
      <Handle type="source" position={vertical ? Position.Bottom : Position.Right} className={lab && !ghost ? "!h-2 !w-2 !bg-accent" : "!opacity-0"} isConnectable={lab && !ghost} />
    </div>
  );
}

export const LayerNode = memo(LayerNodeImpl);

const PATTERNS: Record<string, string> = {
  none: "none",
  dots: "radial-gradient(circle, color-mix(in srgb, var(--c) 22%, transparent) 1px, transparent 1.5px)",
  lines: "repeating-linear-gradient(45deg, color-mix(in srgb, var(--c) 12%, transparent) 0 1px, transparent 1px 10px)",
  cross: "repeating-linear-gradient(0deg, color-mix(in srgb, var(--c) 10%, transparent) 0 1px, transparent 1px 12px), repeating-linear-gradient(90deg, color-mix(in srgb, var(--c) 10%, transparent) 0 1px, transparent 1px 12px)",
  dash: "repeating-linear-gradient(-45deg, color-mix(in srgb, var(--c) 12%, transparent) 0 4px, transparent 4px 12px)",
};

function BandNodeImpl({ data }: NodeProps<Node<BandNodeData>>) {
  const { band } = data;
  const st = STAGE_STYLE[band.stage];
  const Icon = st.icon;
  const select = useAtlas((s) => s.select);
  return (
    <div
      className={`pointer-events-none h-full w-full rounded-xl border ${band.stage === "loss" ? "border-dashed" : ""}`}
      style={{
        ["--c" as string]: st.color,
        background: `${PATTERNS[st.pattern]}, color-mix(in srgb, ${st.color} 6%, transparent)`,
        backgroundSize: st.pattern === "dots" ? "12px 12px" : undefined,
        borderColor: `color-mix(in srgb, ${st.color} 45%, transparent)`,
        width: band.w,
        height: band.h,
      }}
    >
      {/* mouse shortcut only: the stage legend (outside the zoomed canvas) is the accessible way in */}
      <span
        aria-hidden
        className="pointer-events-auto m-1.5 inline-flex min-h-6 cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs font-semibold uppercase tracking-wide hover:bg-surface"
        style={{ color: st.color }}
        onClick={() => select(`stage:${band.stage}`)}
        data-testid={`band-${band.stage}`}
      >
        <Icon size={13} aria-hidden /> {STAGE_CONTENT[band.stage].title}
      </span>
    </div>
  );
}

export const BandNode = memo(BandNodeImpl);

export type GroupNodeData = { name: string; w: number; h: number; groupId: string };

function GroupNodeImpl({ data }: NodeProps<Node<GroupNodeData>>) {
  return (
    <div className="pointer-events-none rounded-xl border-2 border-dashed border-accent/60" style={{ width: data.w, height: data.h }} data-testid={`group-${data.groupId}`}>
      <span className="absolute -top-5 left-1 rounded bg-accent px-1.5 text-[11px] font-semibold text-accent-fg">{data.name}</span>
    </div>
  );
}

export const GroupNode = memo(GroupNodeImpl);
