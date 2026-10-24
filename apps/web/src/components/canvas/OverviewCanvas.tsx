import { memo, useMemo } from "react";
import { Background, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { formatCount, type Architecture, type ComputeResult, type Stage } from "@yolo-atlas/core";
import { STAGE_CONTENT, STAGE_STYLE } from "../../lib/stages";
import { useAtlas } from "../../store/atlas";
import { useTheme } from "../../lib/theme";

type StageData = { stage: Stage; layers: number; params: number; share: number; outputs: string; vertical: boolean };

function StageNodeImpl({ data }: NodeProps<Node<StageData>>) {
  const level = useAtlas((s) => s.readingLevel);
  const st = STAGE_STYLE[data.stage];
  const Icon = st.icon;
  const sc = STAGE_CONTENT[data.stage];
  return (
    <div
      className={`flex h-full w-full flex-col gap-1 rounded-xl border-2 bg-surface p-3 text-left shadow-sm ${data.stage === "loss" ? "border-dashed" : ""}`}
      style={{ borderColor: st.color, width: 260, minHeight: 150 }}
      role="button"
      aria-label={`${sc.title}: ${sc.summary.simple}`}
      data-testid={`overview-${data.stage}`}
    >
      <Handle type="target" position={data.vertical ? Position.Top : Position.Left} className="!opacity-0" isConnectable={false} />
      <div className="flex items-center gap-1.5 font-semibold" style={{ color: st.color }}>
        <Icon size={16} aria-hidden /> {sc.title}
      </div>
      <p className="text-xs leading-snug">{sc.summary[level]}</p>
      <p className="mt-auto text-[11px] text-muted">
        {data.layers ? `${data.layers} layers · ${formatCount(data.params)} params (${(data.share * 100).toFixed(0)}%)` : ""}
        {data.outputs ? ` · out: ${data.outputs}` : ""}
      </p>
      <Handle type="source" position={data.vertical ? Position.Bottom : Position.Right} className="!opacity-0" isConnectable={false} />
    </div>
  );
}

const nodeTypes = { stage: memo(StageNodeImpl) };

/** L0: only the stages, each with a one-line summary. Zoom in or double-click to see the layers. */
function Overview({ arch, comp }: { arch: Architecture; comp: ComputeResult }) {
  const { direction, select, setZoomLevel, autoZoom } = useAtlas();
  const theme = useTheme();
  const vertical = direction === "DOWN";
  const { nodes, edges } = useMemo(() => {
    const order: Stage[] = ["input", "backbone", "neck", "head", "postprocess", "loss"];
    const present = order.filter((s) =>
      s === "input" || s === "postprocess" || (s === "loss" ? arch.training.assigner !== "none" || arch.training.losses.length > 0 : arch.nodes.some((n) => n.stage === s)));
    const ns: Node<StageData>[] = present.map((s, i) => {
      const layers = arch.nodes.filter((n) => n.stage === s);
      const params = layers.reduce((a, n) => a + (comp.nodes[n.id]?.params ?? 0), 0);
      const last = layers[layers.length - 1];
      const outs = s === "backbone" || s === "neck"
        ? [...new Set(layers.filter((n) => (comp.consumers[n.id] ?? []).some((t) => arch.nodes.find((x) => x.id === t)?.stage !== s)).map((n) => comp.nodes[n.id]?.outShape?.join("×")))].join(", ")
        : s === "input" ? `${arch.inputChannels}×${arch.inputSize}×${arch.inputSize}` : last ? "" : "";
      const isTrain = s === "loss";
      const k = isTrain ? present.length - 2 : i;
      const pos = vertical ? { x: isTrain ? 300 : 0, y: k * 240 } : { x: k * 310, y: isTrain ? 260 : 0 };
      return { id: s, type: "stage", position: pos, data: { stage: s, layers: layers.length, params, share: comp.totals.params ? params / comp.totals.params : 0, outputs: outs, vertical }, draggable: false };
    });
    const main = present.filter((s) => s !== "loss");
    const es: Edge[] = main.slice(1).map((s, i) => ({ id: `${main[i]}->${s}`, source: main[i]!, target: s, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: "var(--muted)" } }));
    if (present.includes("loss")) es.push({ id: "head->loss", source: "head", target: "loss", style: { stroke: "var(--stage-loss)", strokeDasharray: "6 4" }, markerEnd: { type: MarkerType.ArrowClosed } });
    return { nodes: ns, edges: es };
  }, [arch, comp, vertical]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, n) => select(`stage:${n.id}`)}
      onNodeDoubleClick={() => setZoomLevel(1)}
      onMoveEnd={(event, vp) => {
        if (autoZoom && event && "deltaY" in (event as object) && vp.zoom > 1.8) setZoomLevel(1);
      }}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      nodesDraggable={false}
      nodesConnectable={false}
      colorMode={theme}
      proOptions={{ hideAttribution: true }}
      aria-label="Overview of the stages"
    >
      <Background gap={24} size={1} color="var(--border)" />
    </ReactFlow>
  );
}

export function OverviewCanvas(props: { arch: Architecture; comp: ComputeResult }) {
  return (
    <ReactFlowProvider>
      <Overview {...props} />
    </ReactFlowProvider>
  );
}
