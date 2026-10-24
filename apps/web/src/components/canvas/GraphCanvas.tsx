import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import {
  Background, Controls, MarkerType, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow,
  type Connection, type Edge, type EdgeMouseHandler, type Node, type NodeMouseHandler, type OnSelectionChangeFunc,
} from "@xyflow/react";
import { getBlock } from "@yolo-atlas/core";
import { applyOps } from "../../store/lab";
import { DRAG_TYPE, insertItem, paletteItemByKey } from "../../lib/labPalette";
import { PRESETS, nodeSpec } from "../../lib/labDefaults";
import "@xyflow/react/dist/style.css";
import type { DisplayGraph } from "../../graph/displayGraph";
import type { LayoutResult } from "../../graph/layout";
import { NODE_SIZE } from "../../graph/layout";
import { useAtlas } from "../../store/atlas";
import { useHighlight } from "../../store/highlight";
import { STAGE_STYLE } from "../../lib/stages";
import { useTheme } from "../../lib/theme";
import { BandNode, GroupNode, LayerNode, type BandNodeData, type GroupNodeData, type LayerNodeData } from "./nodes";
import { ElkEdge, type ElkEdgeData } from "./ElkEdge";

const nodeTypes = { layer: LayerNode, band: BandNode, group: GroupNode };
const edgeTypes = { elk: ElkEdge };

interface Props {
  graph: DisplayGraph;
  layout: LayoutResult;
  /** The view is re-fitted only when this changes (not after every Lab edit). */
  fitKey: string;
}

interface EdgeMenu {
  source: string;
  target: string;
  x: number;
  y: number;
}

function Canvas({ graph, layout, fitKey }: Props) {
  const lab = useAtlas((s) => s.mode === "lab");
  const groups = useAtlas((s) => s.arch?.groups ?? []);
  const [edgeMenu, setEdgeMenu] = useState<EdgeMenu | null>(null);
  const direction = useAtlas((s) => s.direction);
  const select = useAtlas((s) => s.select);
  const setHighlight = useHighlight((s) => s.setIds);
  const rf = useReactFlow();
  const theme = useTheme();

  const nodes = useMemo<Node[]>(() => {
    const bands: Node<BandNodeData>[] = layout.bands.map((b) => ({
      id: `band:${b.stage}`, type: "band", position: { x: b.x, y: b.y }, data: { band: b },
      draggable: false, selectable: false, focusable: false, zIndex: -1, style: { width: b.w, height: b.h },
    }));
    const items: Node<LayerNodeData>[] = graph.nodes.map((d) => {
      const box = layout.boxes[d.id] ?? { x: 0, y: 0, w: NODE_SIZE[d.kind].w, h: NODE_SIZE[d.kind].h };
      return { id: d.id, type: "layer", position: { x: box.x, y: box.y }, data: { d, w: box.w, h: box.h, vertical: direction === "DOWN" }, draggable: false, width: box.w, height: box.h };
    });
    const groupBoxes: Node<GroupNodeData>[] = groups.flatMap((g) => {
      const bs = g.nodeIds.map((id) => layout.boxes[id]).filter(Boolean);
      if (!bs.length) return [];
      const x0 = Math.min(...bs.map((b) => b!.x)) - 10, y0 = Math.min(...bs.map((b) => b!.y)) - 10;
      const x1 = Math.max(...bs.map((b) => b!.x + b!.w)) + 10, y1 = Math.max(...bs.map((b) => b!.y + b!.h)) + 10;
      return [{ id: `group:${g.id}`, type: "group", position: { x: x0, y: y0 }, data: { name: g.name, w: x1 - x0, h: y1 - y0, groupId: g.id }, draggable: false, selectable: false, focusable: false, zIndex: -1 }];
    });
    return [...bands, ...groupBoxes, ...items];
  }, [graph, layout, direction, groups]);

  const edges = useMemo<Edge<ElkEdgeData>[]>(
    () => graph.edges.map((e) => ({
      id: e.id, source: e.source, target: e.target, type: "elk",
      data: { points: layout.edges[e.id] ?? [], label: e.label, skip: e.skip, kind: e.kind },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "var(--muted)" },
      focusable: false,
      interactionWidth: lab ? 14 : 0,
    })),
    [graph, layout, lab],
  );

  // neighbours for hover highlighting
  const related = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const add = (k: string, v: string) => (m.get(k) ?? m.set(k, new Set([k])).get(k)!).add(v);
    for (const e of graph.edges) {
      add(e.source, e.target);
      add(e.source, e.id);
      add(e.target, e.source);
      add(e.target, e.id);
    }
    return m;
  }, [graph]);

  const onEnter: NodeMouseHandler = useCallback((_, n) => {
    if (n.type === "band") return;
    useAtlas.getState().hover(n.id);
    setHighlight(related.get(n.id) ?? new Set([n.id]));
  }, [related, setHighlight]);
  const onLeave: NodeMouseHandler = useCallback(() => {
    useAtlas.getState().hover(null);
    setHighlight(null);
  }, [setHighlight]);
  const onClick: NodeMouseHandler = useCallback((e, n) => {
    if (n.type === "band" || n.type === "group") return;
    if (lab && e.shiftKey) return; // shift-click adds to the multi-selection (handled by React Flow)
    select(n.id);
  }, [select, lab]);

  // ---- Lab: selection, rewiring by dragging handles, inserting on edges, dropping from the palette
  const onSelectionChange: OnSelectionChangeFunc = useCallback(({ nodes: sel }) => {
    if (!lab) return;
    useAtlas.getState().setSelection(sel.filter((n) => n.type === "layer" && !n.id.startsWith("ghost:") && /^(n|x)\d+$/.test(n.id)).map((n) => n.id));
  }, [lab]);
  const onConnect = useCallback((c: Connection) => {
    const st = useAtlas.getState();
    const target = st.arch?.nodes.find((n) => n.id === c.target);
    if (!target || !c.source || !st.arch?.nodes.some((n) => n.id === c.source)) return;
    const def = getBlock(target.module);
    const from = target.from.length < (def?.inputs.max ?? 1) ? [...target.from, c.source] : [...target.from.slice(0, -1), c.source];
    applyOps([{ op: "rewire", nodeId: target.id, from }], "Rewire by dragging");
  }, []);
  const onEdgeClick: EdgeMouseHandler = useCallback((e, edge) => {
    if (!lab || !useAtlas.getState().arch?.nodes.some((n) => n.id === edge.source)) return;
    setEdgeMenu({ source: edge.source, target: edge.target, x: e.clientX, y: e.clientY });
  }, [lab]);
  const onDrop = useCallback((e: DragEvent) => {
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    if (!raw) return;
    e.preventDefault();
    const item = paletteItemByKey(JSON.parse(raw) as string);
    if (!item) return;
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const hit = graph.nodes.find((n) => {
      const b = layout.boxes[n.id];
      return n.kind === "layer" && n.nodeId && !n.id.startsWith("ghost:") && b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
    });
    insertItem(item, hit?.nodeId);
  }, [rf, graph, layout]);

  useEffect(() => {
    const t = setTimeout(() => rf.fitView({ padding: 0.08, duration: 300 }), 30);
    return () => clearTimeout(t);
     
  }, [fitKey, rf]);

  // keyboard / search / walkthrough ask to bring a node into view
  const centerReq = useAtlas((s) => s.centerReq);
  useEffect(() => {
    if (!centerReq) return;
    const b = layout.boxes[centerReq.id];
    if (b) rf.setCenter(b.x + b.w / 2, b.y + b.h / 2, { zoom: Math.max(rf.getZoom(), 0.7), duration: 350 });
  }, [centerReq, layout, rf]);

  const autoZoom = useAtlas((s) => s.autoZoom);
  const onMoveEnd = useCallback((event: MouseEvent | TouchEvent | null, vp: { x: number; y: number; zoom: number }) => {
    // semantic zoom only reacts to the user's own wheel/pinch, not to programmatic fits
    if (!autoZoom || !event || !("deltaY" in event || "touches" in event)) return;
    const st = useAtlas.getState();
    if (vp.zoom < 0.16) st.setZoomLevel(0);
    else if (vp.zoom > 2.2) {
      const el = document.querySelector(".react-flow");
      const r = el?.getBoundingClientRect();
      if (!r) return;
      const cx = (r.width / 2 - vp.x) / vp.zoom, cy = (r.height / 2 - vp.y) / vp.zoom;
      const hit = graph.nodes.find((n) => {
        const b = layout.boxes[n.id];
        return n.kind === "layer" && b && cx >= b.x - 20 && cx <= b.x + b.w + 20 && cy >= b.y - 20 && cy <= b.y + b.h + 20;
      });
      if (hit?.nodeId) st.enter(hit.nodeId);
    }
  }, [autoZoom, graph, layout]);

  return (
    <div className="h-full w-full" onDragOver={(e) => { if (lab) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }} onDrop={lab ? onDrop : undefined}>
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeMouseEnter={onEnter}
      onNodeMouseLeave={onLeave}
      onNodeClick={onClick}
      onPaneClick={() => { select(null); setEdgeMenu(null); }}
      onSelectionChange={onSelectionChange}
      onConnect={onConnect}
      onEdgeClick={onEdgeClick}
      multiSelectionKeyCode="Shift"
      selectionKeyCode="Shift"
      deleteKeyCode={null}
      onNodeDoubleClick={(_, n) => {
        const d = n.data as LayerNodeData;
        if (n.type === "layer" && d.d.nodeId) useAtlas.getState().enter(d.d.nodeId);
      }}
      onMoveEnd={onMoveEnd}
      nodesDraggable={false}
      nodesConnectable={lab}
      elementsSelectable
      onlyRenderVisibleElements
      minZoom={0.05}
      maxZoom={2.5}
      proOptions={{ hideAttribution: true }}
      aria-label="Architecture diagram"
      colorMode={theme}
    >
      <Background gap={24} size={1} color="var(--border)" />
      <MiniMap
        pannable
        zoomable
        ariaLabel="Mini map"
        nodeColor={(n) => (n.type === "band" ? "transparent" : STAGE_STYLE[(n.data as LayerNodeData).d.stage].color)}
        style={{ background: "var(--surface)" }}
        className="!hidden md:!block"
      />
      <Controls showInteractive={false} position="top-left" aria-label="Zoom controls" />
    </ReactFlow>
    {edgeMenu && (
      <div role="menu" className="fixed z-50 w-56 rounded-lg border border-border bg-surface p-1 text-sm shadow-xl" style={{ left: edgeMenu.x, top: edgeMenu.y }} data-testid="edge-menu">
        <p className="px-2 py-1 text-xs text-muted">Insert on this connection</p>
        {[...PRESETS, ...["C2f", "C3k2", "CBAM", "SE", "ECA", "CoordAtt"].map((id) => paletteItemByKey(id)!).filter(Boolean)].map((it) => (
          <button key={it.key} role="menuitem" type="button" className="block w-full rounded px-2 py-1 text-left hover:bg-surface-2"
            onClick={() => {
              const st = useAtlas.getState();
              const near = st.arch?.nodes.find((n) => n.id === edgeMenu.source);
              applyOps([{ op: "insertNode", after: edgeMenu.source, node: nodeSpec(it, near, st.computed), rewire: [edgeMenu.target] }], `Insert ${it.label}`);
              setEdgeMenu(null);
            }}>{it.label}</button>
        ))}
        <button role="menuitem" type="button" className="mt-1 block w-full rounded px-2 py-1 text-left text-danger hover:bg-surface-2"
          onClick={() => {
            const t = useAtlas.getState().arch?.nodes.find((n) => n.id === edgeMenu.target);
            if (t) applyOps([{ op: "rewire", nodeId: t.id, from: t.from.filter((f) => f !== edgeMenu.source) }], "Remove connection");
            setEdgeMenu(null);
          }}>Remove this connection</button>
        <button role="menuitem" type="button" className="block w-full rounded px-2 py-1 text-left text-muted hover:bg-surface-2" onClick={() => setEdgeMenu(null)}>Cancel</button>
      </div>
    )}
    </div>
  );
}

export function GraphCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
