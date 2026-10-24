import type { Architecture } from "../schema";
import type { ComputeResult } from "../engine/compute";
import { allBlocks, getBlock } from "../blocks/registry";
import { formatShape, levelLabel } from "../describe";
import type { Level } from "../content/schema";

export interface DatasetSummary {
  numClasses?: number;
  classNames?: string;
  typicalObjectSizePx?: string;
  imageResolution?: string;
  classImbalance?: string;
  notes?: string;
}

export interface GoalSpec {
  goal: string;
  dataset?: DatasetSummary;
  deploymentTarget?: string;
  budget?: string;
  alreadyTried?: string;
}

/** Example goal shown as a one-click preset in the AI Architect: small objects + a CPU-only edge device. */
export const EXAMPLE_PRESET: GoalSpec = {
  goal: "Detect small road damage (cracks and potholes) in dashcam video frames. Must run on a Raspberry Pi 5 (CPU only). The dataset has 3 classes.",
  dataset: { numClasses: 3, classNames: "longitudinal crack, transverse crack, pothole", typicalObjectSizePx: "10–40 px wide in a 640 px frame (thin cracks)", imageResolution: "1920×1080 dashcam frames, resized to 640", classImbalance: "potholes are rare compared with cracks", notes: "shadows, tar patches and road markings look similar to cracks" },
  deploymentTarget: "Raspberry Pi 5 (4-core ARM CPU, no GPU), ONNX Runtime",
  budget: "keep the model small; aim for a few frames per second on the Pi",
  alreadyTried: "",
};

const approxTokens = (s: string) => Math.ceil(s.length / 4);

/** One line per layer: everything the model needs to refer to nodes and reason about shapes. */
export function architectureTable(arch: Architecture, comp: ComputeResult, withParams = true): string {
  const idx = comp.indexOf;
  const rows = arch.nodes.map((n) => {
    const c = comp.nodes[n.id];
    const from = n.from.length ? n.from.join(",") : "image";
    const lvl = levelLabel(c?.stride ?? null);
    return [n.id, idx[n.id], n.stage, n.module, JSON.stringify(n.args), `x${n.repeats}`, from, `${formatShape(c?.outShape)}${lvl ? ` ${lvl}` : ""}`, withParams ? (c?.params ?? 0) : ""].join(" | ");
  });
  return [`id | index | stage | module | args | repeats | from | output | params`, ...rows].join("\n");
}

/** Blocks the AI may use, with YAML argument order. Fork-only blocks are offered only for the YOLOv13 code base. */
export function blockCatalogue(arch: Architecture): string {
  const v13Only = new Set(["HyperACE", "FullPAD_Tunnel", "DSC3k2", "DSConv", "DownsampleConv"]);
  const skip = new Set(["Identity", "CBLinear", "CBFuse"]);
  return allBlocks()
    .filter((b) => !skip.has(b.id) && (arch.config.codebase === "yolov13" || !v13Only.has(b.id)))
    .map((b) => `- ${b.yamlName}: ${b.displayName}${b.extra ? " [custom block: needs code + parse_model edit]" : ""}; inputs ${b.inputs.min}${b.inputs.max > b.inputs.min ? `-${b.inputs.max}` : ""}; args [${b.args.map((a) => a.name).join(", ")}]`)
    .join("\n");
}

function goalText(g: GoalSpec): string {
  const d = g.dataset ?? {};
  return [
    `Goal: ${g.goal}`,
    d.numClasses ? `Number of classes: ${d.numClasses}` : "",
    d.classNames ? `Classes: ${d.classNames}` : "",
    d.typicalObjectSizePx ? `Typical object size: ${d.typicalObjectSizePx}` : "",
    d.imageResolution ? `Image resolution: ${d.imageResolution}` : "",
    d.classImbalance ? `Class imbalance: ${d.classImbalance}` : "",
    d.notes ? `Dataset notes: ${d.notes}` : "",
    g.deploymentTarget ? `Deployment target: ${g.deploymentTarget}` : "",
    g.budget ? `Budget / latency constraint: ${g.budget}` : "",
    g.alreadyTried ? `Already tried: ${g.alreadyTried}` : "",
  ].filter(Boolean).join("\n");
}

export interface PatchContext {
  arch: Architecture;
  comp: ComputeResult;
  goal: GoalSpec;
  level: Level;
  /** Follow-up request ("make it lighter") with the previous patch for refinement. */
  followUp?: { request: string; previousPatchJson: string };
  /** Problems from the previous attempt (repair loop). */
  repair?: { previousPatchJson: string; problems: string[] };
  tokenBudget?: number;
}

export function buildPatchUser(ctx: PatchContext): string {
  const { arch, comp } = ctx;
  const head = (withParams: boolean) => [
    `Task: ${arch.task}. Version: ${arch.version}. Scale: ${arch.config.scale ?? "fixed"} (depth ${comp.scaleRow.depth}, width ${comp.scaleRow.width}). Input size: ${arch.inputSize}. Classes (nc): ${arch.config.nc}.`,
    `Totals: ${comp.totals.params} parameters, ${comp.totals.gflops.toFixed(2)} GFLOPs. Post-processing: ${arch.postprocess.nms ? "NMS" : "NMS-free (end-to-end)"}. Losses: ${arch.training.losses.map((l) => l.kind).join(", ")}. Assigner: ${arch.training.assigner}.`,
    "",
    "Architecture (one row per layer):",
    architectureTable(arch, comp, withParams),
    "",
    "Allowed blocks (module name: description; inputs; YAML args in order):",
    blockCatalogue(arch),
    "",
    goalText(ctx.goal),
    `Reading level for the rationale text: ${ctx.level}.`,
  ];
  let parts = head(true);
  if (ctx.tokenBudget && approxTokens(parts.join("\n")) > ctx.tokenBudget) parts = head(false); // drop the params column first
  if (ctx.followUp) parts.push("", `Previous patch: ${ctx.followUp.previousPatchJson}`, `The user now asks: ${ctx.followUp.request}`, "Return a full new patch against the ARCHITECTURE ABOVE (the previous patch is not applied).");
  if (ctx.repair) parts.push("", `Previous attempt: ${ctx.repair.previousPatchJson}`, "Problems:", ...ctx.repair.problems.map((p) => `- ${p}`));
  return parts.join("\n");
}

export interface ExplainContext {
  arch: Architecture;
  comp: ComputeResult;
  goal: GoalSpec;
  level: Level;
  nodeIds: string[];
  /** Rationale per node id from the applied patch (if any). */
  rationales: Record<string, string>;
}

export function buildExplainUser(ctx: ExplainContext): string {
  const { arch, comp } = ctx;
  const lines = ctx.nodeIds.map((id) => {
    const n = arch.nodes.find((x) => x.id === id);
    if (!n) return "";
    const c = comp.nodes[id];
    const ins = n.from.map((f) => `${f} (${getBlock(arch.nodes.find((x) => x.id === f)?.module ?? "")?.displayName ?? f}, ${formatShape(comp.nodes[f]?.outShape)})`).join("; ") || "the image";
    const outs = (comp.consumers[id] ?? []).map((t) => `${t} (${getBlock(arch.nodes.find((x) => x.id === t)?.module ?? "")?.displayName ?? t})`).join("; ") || "the predictions";
    return `- ${id}: layer ${c?.index} ${getBlock(n.module)?.displayName ?? n.module} ${JSON.stringify(n.args)} in ${n.stage}, output ${formatShape(c?.outShape)} ${levelLabel(c?.stride ?? null) ?? ""}; ${n.origin}${ctx.rationales[id] ? ` (why changed: ${ctx.rationales[id]})` : ""}; receives from ${ins}; sends to ${outs}.`;
  });
  return [
    `Model: ${arch.version} ${arch.task}, scale ${arch.config.scale ?? "fixed"}, input ${arch.inputSize}, ${arch.config.nc} classes.`,
    goalText(ctx.goal),
    `Reading level: ${ctx.level}.`,
    "Explain these nodes (return one entry per node id, same ids):",
    ...lines,
  ].join("\n");
}
