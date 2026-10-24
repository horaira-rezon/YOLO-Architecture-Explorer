import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider, useReactFlow,
  type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronRight, LogIn } from "lucide-react";
import { blockGraph, flattenIR, formatCount, formatShape, type FlatGraph, type IRGraph } from "@yolo-atlas/core";
import { useAtlas } from "../../store/atlas";
import { layoutPlain, type Box, type Point } from "../../graph/layout";
import { useTheme } from "../../lib/theme";
import { ElkEdge, type ElkEdgeData } from "./ElkEdge";

/** The graph of the group at `path` inside a layer's block ("" = the block itself). */
export function subgraphAt(g: IRGraph, path: string): IRGraph | null {
  if (!path) return g;
  let cur: IRGraph = g;
  for (const seg of path.split(".")) {
    const n = cur.nodes.find((x) => x.name === seg && x.kind === "group" && x.children);
    if (!n?.children) return null;
    cur = n.children;
  }
  return cur;
}

type InnerData = {
  label: string;
  type: string;
  shape: string;
  params: number;
  expandable: boolean;
  io: "in" | "out" | null;
  inactive: boolean;
  path: string;
};

const W = 190, H = 58;

function InnerNodeImpl({ id, data }: NodeProps<Node<InnerData>>) {
  const selected = useAtlas((s) => s.inside?.selected === data.path);
  const enter = useAtlas((s) => s.enter);
  const inside = useAtlas((s) => s.inside);
  const io = data.io;
  return (
    <div
      role="button"
      aria-label={io ? `${data.label}, ${data.shape}` : `${data.label} (${data.type}), output ${data.shape}${data.expandable ? ", can be opened" : ""}`}
      data-testid={`inner-${id}`}
      className={`relative flex h-full w-full flex-col justify-between rounded-lg border px-2 py-1 text-left ${
        io ? "border-dashed border-border bg-surface-2" : "bg-surface"
      } ${selected ? "ring-2 ring-accent" : "border-border"} ${data.inactive ? "opacity-60" : ""}`}
      style={{ width: W, height: H }}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" isConnectable={false} />
      <div className="flex items-center gap-1 text-[12px] font-semibold">
        <span className="truncate">{data.label}</span>
        {!io && <span className="truncate font-normal text-muted">{data.type}</span>}
        {data.expandable && inside && (
          <button
            type="button"
            className="ml-auto rounded p-0.5 hover:bg-surface-2"
            aria-label={`Open ${data.label}`}
            title="Look inside"
            onClick={(e) => {
              e.stopPropagation();
              enter(inside.nodeId, data.path);
            }}
          >
            <LogIn size={13} />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 font-mono text-[10px] text-muted">
        <span>{data.shape}</span>
        {data.params > 0 && <span className="ml-auto">{formatCount(data.params)} p</span>}
        {data.inactive && <span className="ml-auto">training only</span>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" isConnectable={false} />
    </div>
  );
}

const InnerNode = memo(InnerNodeImpl);
const nodeTypes = { inner: InnerNode };
const edgeTypes = { elk: ElkEdge };

function Canvas() {
  const { arch, computed, inside, zoomLevel, insideSelect, enter, exitInside, autoZoom } = useAtlas();
  const theme = useTheme();
  const rf = useReactFlow();
  const [layout, setLayout] = useState<{ boxes: Record<string, Box>; edges: Record<string, Point[]> } | null>(null);

  const flat: FlatGraph | null = useMemo(() => {
    if (!inside || !computed) return null;
    const ir = computed.nodes[inside.nodeId]?.ir;
    if (!ir) return null;
    const g = subgraphAt(blockGraph(ir), inside.path);
    return g ? flattenIR(g, zoomLevel >= 3 ? Infinity : 1) : null;
  }, [inside, computed, zoomLevel]);

  const node = arch?.nodes.find((n) => n.id === inside?.nodeId);
  const comp = node ? computed?.nodes[node.id] : undefined;
  const prefix = inside?.path ? `${inside.path}.` : "";

  const items = useMemo(() => {
    if (!flat || !arch || !computed || !node) return null;
    const inputs = flat.inputs.map((inp, k) => {
      const src = node.from[k];
      const sc = src ? computed.nodes[src] : undefined;
      const label = inside?.path ? `input ${k + 1}` : src ? `from layer ${sc?.index}` : "image";
      return { id: inp.id, data: { label, type: "", shape: formatShape(inp.shape), params: 0, expandable: false, io: "in" as const, inactive: false, path: "" } };
    });
    const nodes = flat.nodes.map((n) => ({
      id: n.id,
      data: { label: n.name, type: n.type, shape: formatShape(n.out), params: n.params, expandable: n.expandable, io: null, inactive: !!n.inactive, path: `${prefix}${n.id}` },
    }));
    const outs = flat.outputs.map((o, k) => ({ id: `out${k}`, src: o, data: { label: inside?.path ? `output ${k + 1}` : "to next layers", type: "", shape: "", params: 0, expandable: false, io: "out" as const, inactive: false, path: "" } }));
    const known = new Set([...inputs.map((i) => i.id), ...nodes.map((n) => n.id)]);
    const base = (ref: string) => ref.split(":")[0]!;
    const edges = [
      ...flat.edges.filter((e) => known.has(base(e.source))).map((e) => ({ id: e.id, source: base(e.source), target: e.target, label: formatShape(e.shape) })),
      ...outs.filter((o) => known.has(base(o.src))).map((o) => ({ id: `${o.src}->${o.id}`, source: base(o.src), target: o.id, label: "" })),
    ];
    return { all: [...inputs, ...nodes, ...outs.map(({ id, data }) => ({ id, data }))], edges };
  }, [flat, arch, computed, node, inside?.path, prefix]);

  useEffect(() => {
    if (!items) return;
    let alive = true;
    layoutPlain(items.all.map((n) => ({ id: n.id, w: W, h: H })), items.edges, "DOWN").then((l) => alive && setLayout(l)).catch(() => alive && setLayout({ boxes: {}, edges: {} }));
    return () => {
      alive = false;
    };
  }, [items]);

  useEffect(() => {
    const t = setTimeout(() => rf.fitView({ padding: 0.1, duration: 250 }), 40);
    return () => clearTimeout(t);
  }, [layout, rf]);

  const rfNodes = useMemo<Node<InnerData>[]>(
    () => (items && layout ? items.all.map((n) => ({ id: n.id, type: "inner", position: { x: layout.boxes[n.id]?.x ?? 0, y: layout.boxes[n.id]?.y ?? 0 }, data: n.data, draggable: false, width: W, height: H })) : []),
    [items, layout],
  );
  const rfEdges = useMemo<Edge<ElkEdgeData>[]>(
    () => (items && layout ? items.edges.map((e) => ({
      id: e.id, source: e.source, target: e.target, type: "elk",
      data: { points: layout.edges[e.id] ?? [], label: e.label, skip: false, kind: "data" as const },
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: "var(--muted)" },
    })) : []),
    [items, layout],
  );

  const onClick = useCallback((_: unknown, n: Node<InnerData>) => {
    if (n.data.io) return;
    insideSelect(n.data.path);
  }, [insideSelect]);
  const onDouble = useCallback((_: unknown, n: Node<InnerData>) => {
    if (n.data.expandable && inside) enter(inside.nodeId, n.data.path);
  }, [enter, inside]);

  if (!inside || !node) return null;
  if (!flat) return <div className="flex h-full items-center justify-center text-muted">This layer has no inner parts to show.</div>;
  if (!layout) return <div className="flex h-full items-center justify-center text-muted" role="status">Arranging the inside view…</div>;
  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={onClick}
      onNodeDoubleClick={onDouble}
      onPaneClick={() => insideSelect(null)}
      onMoveEnd={(event, vp) => {
        // zooming far out of a block brings you back to the layer view
        if (autoZoom && event && "deltaY" in (event as object) && vp.zoom < 0.3) exitInside();
      }}
      nodesDraggable={false}
      nodesConnectable={false}
      minZoom={0.1}
      maxZoom={3}
      colorMode={theme}
      proOptions={{ hideAttribution: true }}
      aria-label={`Inside layer ${comp?.index}`}
    >
      <Background gap={20} size={1} color="var(--border)" />
      <MiniMap pannable zoomable ariaLabel="Mini map" style={{ background: "var(--surface)" }} />
      <Controls showInteractive={false} position="top-left" />
    </ReactFlow>
  );
}

export function InsideView() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}

/** "YOLOv8n › Backbone › Layer 6 C2f › m › 0" with each crumb clickable. */
export function Breadcrumbs() {
  const { arch, computed, inside, selectedId, enter, exitInside, insideSelect } = useAtlas();
  if (!arch || !computed) return null;
  const nodeId = inside?.nodeId ?? selectedId;
  const node = nodeId ? arch.nodes.find((n) => n.id === nodeId) : undefined;
  const c = node ? computed.nodes[node.id] : undefined;
  const segs = inside?.path ? inside.path.split(".") : [];
  const crumbs: { label: string; onClick?: () => void }[] = [
    { label: `${arch.version} ${arch.task} ${arch.config.scale ?? ""}`.trim(), onClick: exitInside },
  ];
  if (node) crumbs.push({ label: node.stage[0]!.toUpperCase() + node.stage.slice(1), onClick: exitInside });
  if (node && c) crumbs.push({ label: `Layer ${c.index} ${node.module}`, onClick: inside ? () => enter(node.id, "") : () => enter(node.id) });
  segs.forEach((s, i) => crumbs.push({ label: s, onClick: () => enter(node!.id, segs.slice(0, i + 1).join(".")) }));
  if (inside?.selected) crumbs.push({ label: inside.selected.split(".").slice(segs.length).join(" › "), onClick: () => insideSelect(inside.selected) });
  return (
    <nav aria-label="Breadcrumbs" className="flex min-w-0 items-center gap-0.5 overflow-x-auto text-xs" data-testid="breadcrumbs">
      {crumbs.map((cr, i) => (
        <span key={i} className="flex shrink-0 items-center gap-0.5">
          {i > 0 && <ChevronRight size={12} className="text-muted" aria-hidden />}
          {cr.onClick && i < crumbs.length - 1 ? (
            <button type="button" className="rounded px-1 py-0.5 hover:bg-surface-2" onClick={cr.onClick}>{cr.label}</button>
          ) : (
            <span className="px-1 py-0.5 font-semibold" aria-current="location">{cr.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
