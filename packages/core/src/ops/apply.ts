import type { ArchNode, Architecture, Stage } from "../schema";
import type { NewNode, Operation } from "../schema/operation";
import { OperationSchema } from "../schema/operation";
import { getBlock } from "../blocks/registry";
import { computeArchitecture, type ComputeResult } from "../engine/compute";

export class OperationError extends Error {}

export interface ApplyContext {
  /** Id recorded on nodes this operation creates or changes (history entry / AI patch op). */
  opId: string;
  /** One-line, plain-language description stored on changed nodes. */
  summary?: string;
}

const clone = <T>(x: T): T => structuredClone(x);

function find(arch: Architecture, id: string): { node: ArchNode; index: number } {
  const index = arch.nodes.findIndex((n) => n.id === id);
  if (index < 0) throw new OperationError(`There is no block with id "${id}".`);
  return { node: arch.nodes[index]!, index };
}

function freshId(arch: Architecture, wanted?: string): string {
  if (wanted && !arch.nodes.some((n) => n.id === wanted)) return wanted;
  let id: string;
  do id = `x${arch.nextId++}`;
  while (arch.nodes.some((n) => n.id === id));
  return id;
}

function markModified(n: ArchNode, ctx: ApplyContext, summary: string): void {
  if (n.origin === "builtin") n.origin = "modified";
  n.modification = { opId: ctx.opId, summary: ctx.summary ?? summary };
}

function makeNode(arch: Architecture, spec: NewNode, near: ArchNode, from: string[], ctx: ApplyContext, summary: string): ArchNode {
  const def = getBlock(spec.module);
  if (!def) throw new OperationError(`"${spec.module}" is not a known block.`);
  const stage: Stage = spec.stage ?? (def.isHead ? "head" : near.stage === "head" ? "neck" : near.stage);
  return {
    id: freshId(arch, spec.id), module: def.yamlName, section: near.section === "backbone" && stage === "backbone" ? "backbone" : stage === "backbone" ? "backbone" : "head",
    stage, args: clone(spec.args), repeats: spec.repeats ?? 1, from, origin: "added",
    modification: { opId: ctx.opId, summary: ctx.summary ?? summary },
  };
}

/** Ids of nodes reading from `id`. */
const consumersOf = (arch: Architecture, id: string) => arch.nodes.filter((n) => n.from.includes(id));

/** Remove nodes nothing reads from (except the head), repeatedly. Returns removed ids. */
export function pruneDead(arch: Architecture): string[] {
  const removed: string[] = [];
  for (;;) {
    const dead = arch.nodes.filter((n) => n.stage !== "head" && n !== arch.nodes[arch.nodes.length - 1] && !arch.nodes.some((m) => m.from.includes(n.id)));
    if (!dead.length) return removed;
    arch.nodes = arch.nodes.filter((n) => !dead.includes(n));
    removed.push(...dead.map((d) => d.id));
  }
}

function headNode(arch: Architecture): ArchNode {
  const h = [...arch.nodes].reverse().find((n) => getBlock(n.module)?.isHead);
  if (!h) throw new OperationError("This model has no detection head.");
  return h;
}

/** Halve the first (channel) argument, keeping the rest. */
const halveChannels = (args: ArchNode["args"]) => (typeof args[0] === "number" ? [args[0] / 2, ...args.slice(1)] : clone(args));

function addP2(arch: Architecture, comp: ComputeResult, ctx: ApplyContext): void {
  const head = headNode(arch);
  const strideOf = (id: string) => comp.nodes[id]?.stride ?? 0;
  if (head.from.some((f) => strideOf(f) === 4)) throw new OperationError("The head already has a P2 (stride 4) level.");
  const p3 = head.from.find((f) => strideOf(f) === 8);
  if (!p3) throw new OperationError("The P2 helper needs a head input at stride 8 (P3).");
  const b2 = [...arch.nodes].filter((n) => n.stage === "backbone" && strideOf(n.id) === 4).pop();
  if (!b2) throw new OperationError("The backbone has no stride-4 (P2) feature map to connect to.");
  const p3Node = find(arch, p3).node;
  const p3Consumers = consumersOf(arch, p3).filter((n) => n.id !== head.id);
  const at = find(arch, p3).index;
  const sum = ctx.summary ?? "Added a P2 (stride 4) detection level for tiny objects";
  const up = makeNode(arch, { module: "nn.Upsample", args: ["None", 2, "nearest"], repeats: 1, stage: "neck" }, p3Node, [p3], ctx, sum);
  const cat = makeNode(arch, { module: "Concat", args: [1], repeats: 1, stage: "neck" }, p3Node, [up.id, b2.id], ctx, sum);
  const p2out = makeNode(arch, { module: p3Node.module, args: halveChannels(p3Node.args), repeats: p3Node.repeats, stage: "neck" }, p3Node, [cat.id], ctx, sum);
  p2out.comment = "P2/4-xsmall";
  const c2 = typeof p2out.args[0] === "number" ? p2out.args[0] : 128;
  const down = makeNode(arch, { module: "Conv", args: [c2, 3, 2], repeats: 1, stage: "neck" }, p3Node, [p2out.id], ctx, sum);
  const cat2 = makeNode(arch, { module: "Concat", args: [1], repeats: 1, stage: "neck" }, p3Node, [down.id, p3], ctx, sum);
  const p3new = makeNode(arch, { module: p3Node.module, args: clone(p3Node.args), repeats: p3Node.repeats, stage: "neck" }, p3Node, [cat2.id], ctx, sum);
  p3new.comment = "P3/8-small";
  arch.nodes.splice(at + 1, 0, up, cat, p2out, down, cat2, p3new);
  // the bottom-up path now continues from the new P3 output
  for (const n of p3Consumers) {
    if ([up.id, cat2.id].includes(n.id)) continue;
    n.from = n.from.map((f) => (f === p3 ? p3new.id : f));
    markModified(n, ctx, sum);
  }
  head.from = [p2out.id, ...head.from.map((f) => (f === p3 ? p3new.id : f))];
  markModified(head, ctx, sum);
}

function removeLevel(arch: Architecture, comp: ComputeResult, level: string, ctx: ApplyContext): void {
  const head = headNode(arch);
  const stride = 2 ** Number(level.slice(1));
  const target = head.from.find((f) => comp.nodes[f]?.stride === stride);
  if (!target) throw new OperationError(`The head has no ${level} input.`);
  if (head.from.length <= 1) throw new OperationError("The head needs at least one level.");
  head.from = head.from.filter((f) => f !== target);
  markModified(head, ctx, ctx.summary ?? `Removed the ${level} detection level`);
  pruneDead(arch);
}

/** Apply one operation to a copy of the architecture. Throws OperationError with a plain-language message. */
export function applyOperation(input: Architecture, rawOp: Operation, ctx: ApplyContext): Architecture {
  const op = OperationSchema.parse(rawOp);
  const arch = clone(input);
  switch (op.op) {
    case "insertNode": {
      const { node: after, index } = find(arch, op.after);
      const consumers = consumersOf(arch, after.id);
      const n = makeNode(arch, op.node, after, op.from ?? [after.id], ctx, `Added ${op.node.module}`);
      for (const f of n.from) find(arch, f);
      arch.nodes.splice(index + 1, 0, n);
      const rewire = op.rewire ?? (op.from ? [] : consumers.map((c) => c.id));
      for (const id of rewire) {
        const c = find(arch, id).node;
        c.from = c.from.map((f) => (f === after.id ? n.id : f));
        markModified(c, ctx, `Now reads from the new ${op.node.module}`);
      }
      break;
    }
    case "deleteNode": {
      const { node } = find(arch, op.nodeId);
      if (getBlock(node.module)?.isHead) throw new OperationError("The head cannot be deleted; replace it instead.");
      arch.nodes = arch.nodes.filter((n) => n.id !== node.id);
      for (const c of consumersOf(arch, node.id)) {
        c.from = op.mode === "bridge" && node.from[0] ? c.from.map((f) => (f === node.id ? node.from[0]! : f)) : c.from.filter((f) => f !== node.id);
        markModified(c, ctx, op.mode === "bridge" ? `Bridged over the removed ${node.module}` : `Lost input from the removed ${node.module}`);
      }
      break;
    }
    case "replaceNode": {
      const { node } = find(arch, op.nodeId);
      const def = getBlock(op.module);
      if (!def) throw new OperationError(`"${op.module}" is not a known block.`);
      node.module = def.yamlName;
      node.args = clone(op.args);
      if (op.repeats) node.repeats = op.repeats;
      markModified(node, ctx, `Replaced with ${def.displayName}`);
      break;
    }
    case "updateArgs": {
      const { node } = find(arch, op.nodeId);
      if (op.args) node.args = clone(op.args);
      if (op.repeats) node.repeats = op.repeats;
      markModified(node, ctx, "Changed settings");
      break;
    }
    case "rewire": {
      const { node, index } = find(arch, op.nodeId);
      for (const f of op.from) if (find(arch, f).index >= index) throw new OperationError("A block can only read from blocks that come before it.");
      node.from = [...op.from];
      markModified(node, ctx, "Changed inputs");
      break;
    }
    case "moveNode": {
      const { node, index } = find(arch, op.nodeId);
      arch.nodes.splice(index, 1);
      const to = find(arch, op.after).index;
      arch.nodes.splice(to + 1, 0, node);
      markModified(node, ctx, "Moved");
      break;
    }
    case "duplicateNodes":
    case "pasteNodes": {
      const specs = op.op === "duplicateNodes"
        ? op.nodeIds.map((id) => find(arch, id).node).sort((a, b) => find(arch, a.id).index - find(arch, b.id).index)
        : op.nodes;
      const afterId = op.op === "duplicateNodes" ? specs[specs.length - 1]!.id : op.after;
      let at = find(arch, afterId).index;
      const remap = new Map<string, string>();
      const near = find(arch, afterId).node;
      for (const s of specs) {
        if (getBlock(s.module)?.isHead) throw new OperationError("A head cannot be copied.");
        const from = s.from.map((f) => remap.get(f) ?? (arch.nodes.some((n) => n.id === f) ? f : afterId));
        const n = makeNode(arch, { module: s.module, args: s.args, repeats: s.repeats, stage: s.stage === "head" ? "neck" : s.stage }, near, from, ctx, op.op === "duplicateNodes" ? "Duplicated" : "Pasted");
        remap.set(s.id, n.id);
        arch.nodes.splice(++at, 0, n);
      }
      break;
    }
    case "addHeadLevel": {
      const comp = computeArchitecture(arch);
      if (op.level !== "P2") throw new OperationError("Only the P2 helper is available; add a P6 level by editing.");
      addP2(arch, comp, ctx);
      break;
    }
    case "removeHeadLevel":
      removeLevel(arch, computeArchitecture(arch), op.level, ctx);
      break;
    case "changeLoss":
      arch.training.losses = clone(op.losses);
      break;
    case "changeAssigner":
      arch.training.assigner = op.assigner;
      break;
    case "changePostprocess":
      arch.postprocess = { ...arch.postprocess, ...op.postprocess };
      break;
    case "changeScale":
      if (op.scale !== null && arch.config.scales && !arch.config.scales[op.scale]) throw new OperationError(`Scale "${op.scale}" is not defined.`);
      arch.config.scale = op.scale;
      if (op.depthMultiple !== undefined || op.widthMultiple !== undefined) {
        // custom multipliers: store as a custom scale row so YAML export stays valid
        const base: [number, number, number] = arch.config.scales && arch.config.scale ? arch.config.scales[arch.config.scale]! : [arch.config.depthMultiple, arch.config.widthMultiple, 1024];
        const row: [number, number, number] = [op.depthMultiple ?? base[0], op.widthMultiple ?? base[1], op.maxChannels ?? base[2]];
        if (arch.config.scales) {
          arch.config.scales = { ...arch.config.scales, custom: row };
          arch.config.scale = "custom";
        } else {
          arch.config.depthMultiple = row[0];
          arch.config.widthMultiple = row[1];
        }
      }
      break;
    case "changeInputSize":
      if (op.inputSize % 32 !== 0) throw new OperationError("The input size must be a multiple of 32.");
      arch.inputSize = op.inputSize;
      break;
    case "changeNc":
      arch.config.nc = op.nc;
      break;
    case "changeHead": {
      const head = headNode(arch);
      const def = getBlock(op.module);
      if (!def?.isHead) throw new OperationError(`"${op.module}" is not a head.`);
      head.module = def.yamlName;
      head.args = clone(op.args ?? def.args.map((a) => a.default ?? null));
      markModified(head, ctx, `Head changed to ${def.displayName}`);
      break;
    }
  }
  return arch;
}

/** Apply several operations as one step (used for AI patches and multi-node edits). */
export function applyOperations(arch: Architecture, ops: Operation[], ctx: ApplyContext): Architecture {
  return ops.reduce((a, op, i) => applyOperation(a, op, { ...ctx, opId: ops.length > 1 ? `${ctx.opId}.${i}` : ctx.opId }), arch);
}
