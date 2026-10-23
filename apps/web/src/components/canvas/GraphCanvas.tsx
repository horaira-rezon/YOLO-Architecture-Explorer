import { useCallback, useEffect, useMemo } from "react";
import {
  Background, Controls, MarkerType, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow,
  type Edge, type Node, type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { DisplayGraph } from "../../graph/displayGraph";
import type { LayoutResult } from "../../graph/layout";
import { NODE_SIZE } from "../../graph/layout";
import { useAtlas } from "../../store/atlas";
import { useHighlight } from "../../store/highlight";
import { STAGE_STYLE } from "../../lib/stages";
import { useTheme } from "../../lib/theme";
import { BandNode, LayerNode, type BandNodeData, type LayerNodeData } from "./nodes";
import { ElkEdge, type ElkEdgeData } from "./ElkEdge";

const nodeTypes = { layer: LayerNode, band: BandNode };
const edgeTypes = { elk: ElkEdge };

interface Props {
  graph: DisplayGraph;
  layout: LayoutResult;
}

function Canvas({ graph, layout }: Props) {
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
    return [...bands, ...items];
  }, [graph, layout, direction]);

  const edges = useMemo<Edge<ElkEdgeData>[]>(
    () => graph.edges.map((e) => ({
      id: e.id, source: e.source, target: e.target, type: "elk",
      data: { points: layout.edges[e.id] ?? [], label: e.label, skip: e.skip, kind: e.kind },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "var(--muted)" },
      focusable: false,
    })),
    [graph, layout],
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
  const onClick: NodeMouseHandler = useCallback((_, n) => {
    if (n.type !== "band") select(n.id);
  }, [select]);

  useEffect(() => {
    const t = setTimeout(() => rf.fitView({ padding: 0.08, duration: 300 }), 30);
    return () => clearTimeout(t);
  }, [layout, rf]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeMouseEnter={onEnter}
      onNodeMouseLeave={onLeave}
      onNodeClick={onClick}
      onPaneClick={() => select(null)}
      nodesDraggable={false}
      nodesConnectable={false}
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
      />
      <Controls showInteractive={false} position="top-left" aria-label="Zoom controls" />
    </ReactFlow>
  );
}

export function GraphCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
