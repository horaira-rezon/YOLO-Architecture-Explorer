import type { Architecture, ArchNode, YamlValue } from "../schema";
import type { Operation } from "../schema/operation";
import { Builder, fmt, sumGraph, type IRGraph, type Shape } from "../blocks/builder";
import { getBlock, type BuildCtx } from "../blocks/registry";
import type { HeadResult } from "../blocks/modules";
import { makeDivisible, pyRound } from "../util/math";

export type Severity = "error" | "warning" | "info";

export interface Issue {
  nodeId: string | null;
  severity: Severity;
  code: string;
  /** Plain-language message. */
  message: string;
  suggestedFix?: { label: string; ops: Operation[] };
}

export interface NodeComputed {
  index: number;
  c1s: number[];
  c2: number;
  /** Repeats after the depth multiplier. */
  nEff: number;
  /** Constructor args after parse_model (what PyTorch receives, minus the channel lists). */
  ctorArgs: YamlValue[];
  inShapes: (Shape | null)[];
  outShape: Shape | null;
  /** Every tensor of a tuple-producing block (CBLinear). */
  tupleShapes?: Shape[];
  outputs?: Record<string, Shape>;
  params: number;
  /** FLOPs = 2 × multiply-adds (Ultralytics GFLOPs convention), at the architecture's input size. */
  flops: number;
  /** Part of `flops` coming from functional matrix products (attention). */
  functionalFlops: number;
  /** Down-sampling factor relative to the input image (8 → "P3/8"). */
  stride: number | null;
  ir: IRGraph | null;
  error?: string;
}

export interface ComputeResult {
  nodes: Record<string, NodeComputed>;
  indexOf: Record<string, number>;
  /** Consumers of each node id. */
  consumers: Record<string, string[]>;
  totals: { params: number; flops: number; gflops: number; layers: number };
  issues: Issue[];
  scaleRow: { depth: number; width: number; maxChannels: number };
}

export function scaleRow(arch: Architecture): { depth: number; width: number; maxChannels: number } {
  const c = arch.config;
  if (c.scales && c.scale && c.scales[c.scale]) {
    const [depth, width, maxCh] = c.scales[c.scale]!;
    return { depth, width, maxChannels: c.maxChannels ?? maxCh };
  }
  return { depth: c.depthMultiple, width: c.widthMultiple, maxChannels: c.maxChannels ?? Infinity };
}

/** parse_model: strings naming YAML variables become their values; "None" becomes null. */
function resolveArg(a: YamlValue, arch: Architecture): YamlValue {
  if (typeof a !== "string") return Array.isArray(a) ? a.map((v) => resolveArg(v, arch)) : a;
  if (a === "nc") return arch.config.nc;
  if (a === "kpt_shape") return arch.config.kptShape;
  if (a === "reg_max") return arch.config.regMax ?? 16;
  if (a === "None") return null;
  if (a === "True") return true;
  if (a === "False") return false;
  if (/^-?\d+(\.\d+)?$/.test(a)) return Number(a);
  return a;
}

const isHeadResult = (r: unknown): r is HeadResult => !!r && typeof r === "object" && "outputs" in r;

export function computeArchitecture(arch: Architecture): ComputeResult {
  const { depth, width, maxChannels } = scaleRow(arch);
  const scale = arch.config.scale;
  const issues: Issue[] = [];
  const nodes: Record<string, NodeComputed> = {};
  const indexOf: Record<string, number> = {};
  const consumers: Record<string, string[]> = {};
  arch.nodes.forEach((n, i) => {
    indexOf[n.id] = i;
    consumers[n.id] = [];
  });
  const ch: number[] = [];
  const inShape: Shape = [arch.inputChannels, arch.inputSize, arch.inputSize];
  let legacy = true;

  arch.nodes.forEach((node, i) => {
    const def = getBlock(node.module);
    const base: NodeComputed = {
      index: i, c1s: [], c2: 0, nEff: node.repeats, ctorArgs: [], inShapes: [], outShape: null,
      params: 0, flops: 0, functionalFlops: 0, stride: null, ir: null,
    };
    nodes[node.id] = base;

    // ---- inputs
    const fromIdx: number[] = [];
    let badRef = false;
    if (node.from.length === 0 && i !== 0) {
      issues.push({ nodeId: node.id, severity: "error", code: "no-input", message: "This block has no input. Connect it to an earlier block." });
      badRef = true;
    }
    for (const f of node.from) {
      const j = indexOf[f];
      if (j === undefined) {
        issues.push({ nodeId: node.id, severity: "error", code: "missing-input", message: `This block reads from "${f}", which does not exist any more.` });
        badRef = true;
      } else if (j >= i) {
        issues.push({ nodeId: node.id, severity: "error", code: "forward-ref", message: `This block reads from layer ${j}, which comes after it. Inputs must come from earlier layers (no loops).` });
        badRef = true;
      } else {
        fromIdx.push(j);
        consumers[f]!.push(node.id);
      }
    }
    const c1s = node.from.length === 0 ? [arch.inputChannels] : fromIdx.map((j) => ch[j] ?? 0);
    let inShapes: (Shape | null)[] = node.from.length === 0 ? [inShape] : fromIdx.map((j) => nodes[arch.nodes[j]!.id]!.outShape);
    base.c1s = c1s;
    base.inShapes = inShapes;

    if (!def) {
      issues.push({ nodeId: node.id, severity: "error", code: "unknown-block", message: `"${node.module}" is not a block this app knows. It cannot be computed.` });
      ch.push(c1s[0] ?? 0);
      return;
    }
    if (!badRef && (fromIdx.length || node.from.length === 0) && (c1s.length < def.inputs.min || c1s.length > def.inputs.max)) {
      issues.push({
        nodeId: node.id, severity: "error", code: "input-count",
        message: def.inputs.min === def.inputs.max
          ? `${def.displayName} takes exactly ${def.inputs.min} input${def.inputs.min > 1 ? "s" : ""}, but has ${c1s.length}.`
          : `${def.displayName} takes ${def.inputs.min} to ${def.inputs.max} inputs, but has ${c1s.length}.`,
      });
    }

    // ---- parse_model argument resolution
    let args = node.args.map((a) => resolveArg(a, arch));
    let n = node.repeats > 1 ? Math.max(pyRound(node.repeats * depth), 1) : node.repeats;
    base.nEff = n;
    let c2 = c1s[0] ?? 0;
    switch (def.parse) {
      case "base":
      case "classify": {
        const raw = typeof args[0] === "number" ? args[0] : NaN;
        if (Number.isNaN(raw)) {
          issues.push({ nodeId: node.id, severity: "error", code: "bad-args", message: "The first setting must be the number of output channels." });
        }
        c2 = def.parse === "classify" ? raw : makeDivisible(Math.min(raw, maxChannels) * width, 8);
        args = [c1s[0] ?? 0, c2, ...args.slice(1)];
        if (def.repeatModule) {
          args.splice(2, 0, n);
          n = 1;
        }
        if (def.clearsLegacy) legacy = false;
        const v13 = arch.config.codebase === "yolov13";
        if (v13 && (def.id === "C3k2" || def.id === "DSC3k2") && scale && "lx".includes(scale)) {
          args[3] = true; // the YOLOv13 fork only switches l/x
        } else if (!v13 && def.id === "C3k2" && scale && ["m", "l", "x"].includes(scale)) {
          // python: args[3:4] = [True]
          if (args.length > 3) args[3] = true;
          else args.push(true);
        }
        if (def.id === "A2C2f" && scale && ["l", "x"].includes(scale)) args.push(true, v13 ? 1.5 : 1.2);
        break;
      }
      case "concat":
        c2 = c1s.reduce((a, b) => a + b, 0);
        break;
      case "head": {
        // the YOLOv13 fork's Detect predates the reg_max / end2end arguments
        if (arch.config.codebase !== "yolov13") args = [...args, arch.config.regMax ?? 16, arch.config.end2end ?? false];
        if (/^Segment/.test(def.id) && typeof args[2] === "number") args[2] = makeDivisible(Math.min(args[2], maxChannels) * width, 8);
        c2 = ch[ch.length - 1] ?? 0; // parse_model leaves c2 unchanged for heads
        break;
      }
      case "v10head":
        c2 = ch[ch.length - 1] ?? 0;
        break;
      case "passthrough":
        c2 = c1s[0] ?? 0;
        break;
      case "cblinear": {
        const c2s = Array.isArray(args[0]) ? (args[0] as number[]) : [];
        c2 = c2s.reduce((a, v) => a + v, 0);
        args = [c1s[0] ?? 0, c2s, ...args.slice(1)];
        break;
      }
      case "cbfuse":
        c2 = c1s[c1s.length - 1] ?? 0;
        break;
      case "custom": {
        if (!def.resolve) throw new Error(`${def.id} has no resolve rule`);
        if (def.clearsLegacy) legacy = false;
        const r = def.resolve({ c1s, args, n, scale, width, maxChannels });
        args = r.args;
        c2 = r.c2;
        n = r.n;
        break;
      }
    }
    if (def.selectInputs && inShapes.every((s) => s != null)) {
      const tuples = fromIdx.map((j) => {
        const c = nodes[arch.nodes[j]!.id]!;
        return c.tupleShapes ?? [c.outShape!];
      });
      inShapes = def.selectInputs(tuples, args);
    }
    base.c2 = c2;
    base.ctorArgs = args;
    ch.push(c2);

    if (badRef || inShapes.some((s) => s == null)) {
      if (!badRef) base.error = "waiting for a broken input";
      return;
    }

    // ---- build the module(s) and measure
    const ctx: BuildCtx = { codebase: arch.config.codebase, nc: arch.config.nc, regMax: arch.config.regMax ?? 16, end2end: !!arch.config.end2end, legacy, scale, kptShape: arch.config.kptShape };
    try {
      const b = new Builder(inShapes as Shape[]);
      let outputs: Record<string, Shape> | undefined;
      let out: Shape;
      if (n > 1) {
        // stacked copies (nn.Sequential of n identical modules)
        const r = b.group("seq", "Sequential", [b.in(0)], (q, [x]) => {
          let y = x!;
          for (let j = 0; j < n; j++) {
            const res = q.group(String(j), def.id, [y], (s, ins) => {
              const rr = def.build(s, ins, args, ctx);
              if (isHeadResult(rr) || Array.isArray(rr)) throw new Error("this block cannot be repeated");
              return rr;
            });
            y = res;
          }
          return y;
        });
        out = r.shape;
      } else {
        const res = def.build(b, b.inputs, args, ctx);
        if (Array.isArray(res)) {
          base.tupleShapes = res.map((r) => r.shape);
          out = res[0]!.shape;
        } else if (isHeadResult(res)) {
          outputs = Object.fromEntries(Object.entries(res.outputs).map(([k, r]) => [k, r.shape]));
          out = Object.values(res.outputs)[0]!.shape;
        } else out = res.shape;
      }
      const ir = b.graph([]);
      const s = sumGraph(ir);
      base.ir = ir;
      base.outShape = out;
      base.outputs = outputs;
      base.params = s.params;
      base.flops = 2 * s.ops;
      base.functionalFlops = 2 * s.functionalOps;
      if (out.length === 3) base.stride = arch.inputSize / out[1]!;
      if (!def.isHead && !base.tupleShapes && out[0] !== c2 && def.parse !== "passthrough" && def.parse !== "concat") {
        issues.push({ nodeId: node.id, severity: "warning", code: "channel-mismatch", message: `Expected ${c2} output channels but the block produced ${out[0]}.` });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      base.error = msg;
      issues.push({ nodeId: node.id, severity: "error", code: "build-failed", message: friendly(msg, node, inShapes as Shape[]) });
    }
  });

  const params = Object.values(nodes).reduce((a, n) => a + n.params, 0);
  const flops = Object.values(nodes).reduce((a, n) => a + n.flops, 0);
  return {
    nodes, indexOf, consumers, issues,
    totals: { params, flops, gflops: flops / 1e9, layers: arch.nodes.length },
    scaleRow: { depth, width, maxChannels },
  };
}

function friendly(msg: string, node: ArchNode, ins: Shape[]): string {
  if (msg.startsWith("cannot join"))
    return `Concat can only join maps of the same height and width. Its inputs are ${ins.map(fmt).join(" and ")}. Add an Upsample or a stride-2 Conv so the sizes match.`;
  if (msg.startsWith("cannot add")) return `This block adds two maps that have different sizes (${msg.slice(11)}).`;
  return `${node.module} could not be built: ${msg}.`;
}
