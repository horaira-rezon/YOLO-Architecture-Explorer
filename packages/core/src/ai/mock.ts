import { getBlock } from "../blocks/registry";
import type { Architecture } from "../schema";
import type { ComputeResult } from "../engine/compute";
import type { AIProvider, ChatInput } from "./provider";
import type { ExplainContext, PatchContext } from "./context";
import type { NodeGoals, Patch, PatchOp } from "./schema";

const base = { isHypothesis: true, confidence: "medium" as const };

function headInputs(arch: Architecture, comp: ComputeResult) {
  const head = [...arch.nodes].reverse().find((n) => getBlock(n.module)?.isHead);
  return head ? head.from.map((id) => ({ id, stride: comp.nodes[id]?.stride ?? 0 })) : [];
}

/**
 * Deterministic offline provider: rule-based patches from keywords in the goal. Used in tests, E2E and as an
 * offline demo. Its text is written by hand and labelled as a demo in the UI.
 */
export class MockProvider implements AIProvider {
  readonly id = "mock";
  readonly label = "Offline demo (no AI)";
  /** Return an invalid first patch to exercise the repair loop. */
  constructor(private opts: { breakFirst?: boolean } = {}) {}
  private calls = 0;

  async generatePatch(ctx: PatchContext): Promise<unknown> {
    this.calls++;
    const { arch, comp, goal } = ctx;
    const text = `${goal.goal} ${goal.deploymentTarget ?? ""} ${goal.budget ?? ""} ${ctx.followUp?.request ?? ""}`.toLowerCase();
    const ops: PatchOp[] = [];
    const nc = goal.dataset?.numClasses ?? Number(text.match(/(\d+)\s*classes/)?.[1] ?? NaN);
    if (Number.isFinite(nc) && nc !== arch.config.nc) {
      ops.push({ ...base, op: "changeNc", value: String(nc), confidence: "high", breaksPretrained: true,
        rationaleSimple: `The model must choose between your ${nc} kinds of objects instead of ${arch.config.nc}.`,
        rationaleForGoal: `Your dataset has ${nc} classes, so the class branch of the head needs exactly ${nc} outputs.`,
        tradeoff: "The class layers of the head start from scratch.", risk: "None for the structure; it is required for training." });
    }
    const lighter = /lighter|smaller|faster/.test(ctx.followUp?.request ?? "");
    const ins = headInputs(arch, comp);
    const p3 = ins.find((i) => i.stride === 8);
    if (/tiny|small|seedling|drone|aerial/.test(text) && p3 && !lighter) {
      ops.push({ ...base, op: "insertNode", after: p3.id, newId: "ai1", module: "CBAM", args: "[7]", breaksPretrained: false,
        rationaleSimple: "Adds a 'where to look' step on the most detailed map the head uses.",
        rationaleForGoal: "Tiny seedlings cover few pixels; spatial attention is designed to highlight small, important regions and quiet the soil background.",
        tradeoff: "Small extra cost; benefit must be measured.", risk: "May not help if objects are already well separated.", confidence: "medium" });
      if (!ins.some((i) => i.stride === 4) && !/keep.*(only|p3)/.test(text))
        ops.push({ ...base, op: "addHeadLevel", level: "P2", breaksPretrained: true,
          rationaleSimple: "Adds a fourth, very detailed map (stride 4) where the model looks for very small things.",
          rationaleForGoal: "Weeds of 8–32 px are only 1–4 cells wide at stride 8; a stride-4 level gives them more cells to be found in.",
          tradeoff: "Clearly more compute (the P2 map has 4× the cells of P3), more memory, slower on the Jetson.", risk: "Can raise false positives on soil texture; check speed on the device.", confidence: "high" });
    }
    if (/jetson|edge|raspberry|mobile|real-?time|light/.test(text) || lighter) {
      const conv = arch.nodes.find((n, i) => n.module === "Conv" && n.stage === "neck" && i > 0 && typeof n.args[2] === "number" && n.args[2] === 2);
      if (conv) ops.push({ ...base, op: "replaceNode", nodeId: conv.id, module: "GhostConv", args: JSON.stringify(conv.args.slice(0, 3)), breaksPretrained: true,
        rationaleSimple: "Swaps one downsampling step for a cheaper 'ghost' version.",
        rationaleForGoal: "Saves compute on the edge device to make room for the extra detail level.",
        tradeoff: "Slightly less learning capacity in that step.", risk: "Low.", confidence: "medium" });
    }
    if (this.opts.breakFirst && this.calls === 1) ops.push({ ...base, op: "deleteNode", nodeId: "does-not-exist", breaksPretrained: false, rationaleSimple: "x", rationaleForGoal: "x", tradeoff: "x", risk: "x" });
    const patch: Patch = {
      summary: ops.length ? "Demo patch (rule-based, no AI): " + ops.map((o) => o.op).join(", ") : "Demo patch: no rule matched your goal, so nothing is changed.",
      assumptions: ["This is the offline demo provider: changes come from simple keyword rules, not from an AI."],
      suggestedExperiments: ["Train the unmodified model first (baseline).", ...ops.map((o, i) => `Then add change ${i + 1} (${o.op}) on its own and compare mAP and speed on the target device.`)],
      operations: ops,
    };
    return patch;
  }

  async explainNodes(ctx: ExplainContext): Promise<NodeGoals> {
    const g = ctx.goal.goal;
    return {
      nodes: ctx.nodeIds.map((id) => {
        const n = ctx.arch.nodes.find((x) => x.id === id)!;
        const c = ctx.comp.nodes[id];
        const name = getBlock(n.module)?.displayName ?? n.module;
        const shape = c?.outShape?.join("×") ?? "?";
        return {
          nodeId: id,
          role: `${name} at layer ${c?.index} turns its input into a ${shape} map.`,
          contribution: n.origin === "builtin" ? `Unchanged. For your goal ("${g.slice(0, 60)}") it still provides the ${n.stage} features later steps rely on.` : `Changed for your goal: ${ctx.rationales[id] ?? n.modification?.summary ?? "see the change list"}.`,
          howItWorksHere: `It receives ${n.from.length ? n.from.join(", ") : "the image"} and hands a ${shape} map to the next layer.`,
          whatWouldBreak: "Removing it would change every shape after it and the model would need retraining.",
          tradeoff: `${(c?.params ?? 0).toLocaleString()} parameters and ${((c?.flops ?? 0) / 1e9).toFixed(2)} GFLOPs.`,
        };
      }),
    };
  }

  async chat(input: ChatInput): Promise<string> {
    return `Offline demo: no AI is connected, so this is not a real answer to "${input.question}". Connect a provider in Settings. Meanwhile, the panel above explains this block.`;
  }
}
