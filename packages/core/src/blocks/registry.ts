import type { Builder, Ref, Shape } from "./builder";
import type { YamlValue } from "../schema";
import * as M from "./modules";
import { makeDivisible } from "../util/math";

/** How Ultralytics `parse_model` turns YAML args into constructor args and output channels. */
export type ParseKind =
  | "base" // c1 = ch[f], c2 = make_divisible(min(args[0], max_ch) * width, 8)
  | "classify" // like base, but c2 = nc is never scaled
  | "concat" // c2 = sum of input channels
  | "head" // Detect / Segment / Pose / OBB (+26): args += [reg_max, end2end, ch]
  | "v10head" // v10Detect: args += [ch]
  | "passthrough" // c2 = ch[f] (Upsample, Identity…)
  | "cblinear" // c2 = args[0] (a list of output widths)
  | "cbfuse" // c2 = ch[f[-1]]
  | "custom"; // block-specific rule in `resolve`

export type BlockCategory = "conv" | "csp" | "attention" | "pooling" | "resample" | "merge" | "head" | "downsample" | "extra";

export type ArgKind = "channels" | "int" | "float" | "bool" | "enum" | "string" | "intlist" | "kpt" | "nc" | "none";

export interface ArgSpec {
  name: string;
  label: string;
  kind: ArgKind;
  default?: YamlValue;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export interface ResolveInput {
  c1s: number[];
  args: YamlValue[];
  n: number;
  scale: string | null;
  width: number;
  maxChannels: number;
}

export interface BuildCtx {
  codebase: "ultralytics" | "yolov13";
  nc: number;
  regMax: number;
  end2end: boolean;
  legacy: boolean;
  scale: string | null;
  kptShape: [number, number] | null;
}

export interface BlockDefinition {
  /** Canonical id (YAML name without `nn.`). */
  id: string;
  yamlName: string;
  displayName: string;
  category: BlockCategory;
  parse: ParseKind;
  /** Member of parse_model's `repeat_modules`: `n` becomes a constructor arg instead of stacking copies. */
  repeatModule?: boolean;
  /** Sets parse_model's `legacy = False` (newer Detect head style). */
  clearsLegacy?: boolean;
  inputs: { min: number; max: number };
  /** YAML args in order (for base modules the first is the output channels). */
  args: ArgSpec[];
  /** Mirror of the PyTorch module. `ctor` are the constructor args after parse_model. */
  build(b: Builder, ins: Ref[], ctor: YamlValue[], ctx: BuildCtx): Ref | Ref[] | M.HeadResult;
  /** Pick which tensors of tuple-producing inputs this block reads (CBFuse). Default: each input's first output. */
  selectInputs?(inputs: Shape[][], ctor: YamlValue[]): Shape[];
  /** For parse = "custom": constructor args, output channels and remaining repeats. */
  resolve?(p: ResolveInput): { args: YamlValue[]; c2: number; n: number };
  isHead?: boolean;
  /** Version family that introduced the block (for the palette/legend). */
  introducedIn?: string;
  /** Not part of any official config; offered in the Lab palette. */
  extra?: boolean;
}

const num = (v: YamlValue | undefined, d: number): number => (typeof v === "number" ? v : d);
const bool = (v: YamlValue | undefined, d: boolean): boolean => (typeof v === "boolean" ? v : v == null ? d : !!v);
const nOrNull = (v: YamlValue | undefined): number | null => (typeof v === "number" ? v : null);

const one = { min: 1, max: 1 };
const C2 = (label = "Output channels"): ArgSpec => ({ name: "c2", label, kind: "channels", min: 8, max: 4096, step: 8 });

const defs: BlockDefinition[] = [
  // ------------------------------------------------------------ convolutions
  {
    id: "Conv", yamlName: "Conv", displayName: "Conv", category: "conv", parse: "base", inputs: one,
    args: [C2(), { name: "k", label: "Kernel size", kind: "int", default: 1, min: 1, max: 9 }, { name: "s", label: "Stride", kind: "int", default: 1, min: 1, max: 4 },
      { name: "p", label: "Padding (auto if empty)", kind: "int", default: null }, { name: "g", label: "Groups", kind: "int", default: 1, min: 1 }, { name: "d", label: "Dilation", kind: "int", default: 1, min: 1, max: 6 }],
    build: (b, [x], a) => M.Conv(b, "conv", x!, num(a[1], 0), num(a[2], 1), num(a[3], 1), nOrNull(a[4]), num(a[5], 1), num(a[6], 1), (a[7] as boolean | undefined) ?? true),
  },
  {
    id: "DWConv", yamlName: "DWConv", displayName: "Depthwise Conv", category: "conv", parse: "base", inputs: one,
    args: [C2(), { name: "k", label: "Kernel size", kind: "int", default: 1, min: 1, max: 9 }, { name: "s", label: "Stride", kind: "int", default: 1, min: 1, max: 4 }],
    build: (b, [x], a) => M.DWConv(b, "dwconv", x!, num(a[1], 0), num(a[2], 1), num(a[3], 1)),
  },
  {
    id: "GhostConv", yamlName: "GhostConv", displayName: "Ghost Conv", category: "conv", parse: "base", inputs: one,
    args: [C2(), { name: "k", label: "Kernel size", kind: "int", default: 1, min: 1, max: 9 }, { name: "s", label: "Stride", kind: "int", default: 1, min: 1, max: 4 }],
    build: (b, [x], a) => M.GhostConv(b, "ghostconv", x!, num(a[1], 0), num(a[2], 1), num(a[3], 1)),
  },
  {
    id: "RepConv", yamlName: "RepConv", displayName: "RepConv", category: "conv", parse: "passthrough", inputs: one, extra: true,
    args: [C2(), { name: "k", label: "Kernel size", kind: "int", default: 3 }, { name: "s", label: "Stride", kind: "int", default: 1 }],
    build: (b, [x], a) => M.RepConv(b, "repconv", x!, num(a[0], x!.shape[0]!), 3, num(a[2], 1)),
  },
  // ------------------------------------------------------------ CSP / ELAN families
  {
    id: "C2f", yamlName: "C2f", displayName: "C2f", category: "csp", parse: "base", repeatModule: true, inputs: one, introducedIn: "v8",
    args: [C2(), { name: "shortcut", label: "Shortcut (residual add)", kind: "bool", default: false }],
    build: (b, [x], a) => M.C2f(b, "c2f", x!, num(a[1], 0), num(a[2], 1), bool(a[3], false), num(a[4], 1), num(a[5], 0.5)),
  },
  {
    id: "C3", yamlName: "C3", displayName: "C3", category: "csp", parse: "base", repeatModule: true, inputs: one,
    args: [C2(), { name: "shortcut", label: "Shortcut", kind: "bool", default: true }],
    build: (b, [x], a) => M.C3(b, "c3", x!, num(a[1], 0), num(a[2], 1), bool(a[3], true), num(a[4], 1), num(a[5], 0.5)),
  },
  {
    id: "C3Ghost", yamlName: "C3Ghost", displayName: "C3 Ghost", category: "csp", parse: "base", repeatModule: true, inputs: one,
    args: [C2(), { name: "shortcut", label: "Shortcut", kind: "bool", default: true }],
    build: (b, [x], a) => M.C3Ghost(b, "c3ghost", x!, num(a[1], 0), num(a[2], 1), bool(a[3], true)),
  },
  {
    id: "C3k2", yamlName: "C3k2", displayName: "C3k2", category: "csp", parse: "base", repeatModule: true, clearsLegacy: true, inputs: one, introducedIn: "11",
    args: [C2(), { name: "c3k", label: "Use C3k inner blocks", kind: "bool", default: false }, { name: "e", label: "Hidden width ratio", kind: "float", default: 0.5, min: 0.125, max: 1, step: 0.125 },
      { name: "attn", label: "Add attention (PSABlock)", kind: "bool", default: false }],
    build: (b, [x], a) => M.C3k2(b, "c3k2", x!, num(a[1], 0), num(a[2], 1), bool(a[3], false), num(a[4], 0.5), bool(a[5], false), num(a[6], 1), bool(a[7], true)),
  },
  {
    id: "C3k", yamlName: "C3k", displayName: "C3k", category: "csp", parse: "base", repeatModule: false, inputs: one, introducedIn: "11",
    args: [C2(), { name: "n", label: "Inner bottlenecks", kind: "int", default: 1 }],
    build: (b, [x], a) => M.C3k(b, "c3k", x!, num(a[1], 0), num(a[2], 1)),
  },
  {
    id: "RepNCSPELAN4", yamlName: "RepNCSPELAN4", displayName: "RepNCSPELAN4 (GELAN)", category: "csp", parse: "base", inputs: one, introducedIn: "v9",
    args: [C2(), { name: "c3", label: "Inner width", kind: "int" }, { name: "c4", label: "Branch width", kind: "int" }, { name: "n", label: "Inner repeats", kind: "int", default: 1 }],
    build: (b, [x], a) => M.RepNCSPELAN4(b, "elan", x!, num(a[1], 0), num(a[2], 0), num(a[3], 0), num(a[4], 1)),
  },
  {
    id: "ELAN1", yamlName: "ELAN1", displayName: "ELAN1", category: "csp", parse: "base", inputs: one, introducedIn: "v9",
    args: [C2(), { name: "c3", label: "Inner width", kind: "int" }, { name: "c4", label: "Branch width", kind: "int" }],
    build: (b, [x], a) => M.ELAN1(b, "elan1", x!, num(a[1], 0), num(a[2], 0), num(a[3], 0)),
  },
  {
    id: "C2fCIB", yamlName: "C2fCIB", displayName: "C2fCIB", category: "csp", parse: "base", repeatModule: true, clearsLegacy: true, inputs: one, introducedIn: "v10",
    args: [C2(), { name: "shortcut", label: "Shortcut", kind: "bool", default: false }, { name: "lk", label: "Large 7×7 kernel (RepVGGDW)", kind: "bool", default: false }],
    build: (b, [x], a) => M.C2fCIB(b, "c2fcib", x!, num(a[1], 0), num(a[2], 1), bool(a[3], false), bool(a[4], false)),
  },
  {
    id: "A2C2f", yamlName: "A2C2f", displayName: "A2C2f (area attention)", category: "attention", parse: "base", repeatModule: true, clearsLegacy: true, inputs: one, introducedIn: "12",
    args: [C2(), { name: "a2", label: "Use area attention", kind: "bool", default: true }, { name: "area", label: "Number of areas", kind: "int", default: 1, min: 1, max: 8 }],
    build: (b, [x], a, ctx) => (ctx.codebase === "yolov13" ? M.A2C2f13 : M.A2C2f)(b, "a2c2f", x!, num(a[1], 0), num(a[2], 1), bool(a[3], true), num(a[4], 1), bool(a[5], false), num(a[6], 2.0), num(a[7], 0.5), num(a[8], 1), bool(a[9], true)),
  },
  // ------------------------------------------------------------ YOLOv13
  {
    id: "DSC3k2", yamlName: "DSC3k2", displayName: "DS-C3k2", category: "csp", parse: "base", repeatModule: true, clearsLegacy: true, inputs: one, introducedIn: "13",
    args: [C2(), { name: "dsc3k", label: "Use DS-C3k inner blocks", kind: "bool", default: false }, { name: "e", label: "Hidden width ratio", kind: "float", default: 0.5, min: 0.125, max: 1, step: 0.125 }],
    build: (b, [x], a) => M.DSC3k2(b, "dsc3k2", x!, num(a[1], 0), num(a[2], 1), bool(a[3], false), num(a[4], 0.5), num(a[5], 1), bool(a[6], true), num(a[7], 3), num(a[8], 7), num(a[9], 1)),
  },
  {
    id: "DSConv", yamlName: "DSConv", displayName: "DSConv (depthwise separable)", category: "conv", parse: "base", inputs: one, introducedIn: "13",
    args: [C2(), { name: "k", label: "Kernel size", kind: "int", default: 3, min: 1, max: 9 }, { name: "s", label: "Stride", kind: "int", default: 1, min: 1, max: 4 }],
    build: (b, [x], a) => M.DSConv(b, "dsconv", x!, num(a[1], 0), num(a[2], 3), num(a[3], 1), nOrNull(a[4]), num(a[5], 1)),
  },
  {
    id: "HyperACE", yamlName: "HyperACE", displayName: "HyperACE (hypergraph correlation)", category: "attention", parse: "custom", clearsLegacy: true, inputs: { min: 3, max: 3 }, introducedIn: "13",
    args: [C2(), { name: "num_hyperedges", label: "Hyperedges", kind: "int", default: 8, min: 2, max: 32 }, { name: "dsc3k", label: "DS-C3k inner blocks", kind: "bool", default: true },
      { name: "shortcut", label: "Shortcut", kind: "bool", default: true }, { name: "e1", label: "Hidden width ratio", kind: "float", default: 0.5 }, { name: "e2", label: "Hypergraph width ratio", kind: "float", default: 1 }, { name: "context", label: "Context", kind: "enum", default: "both", options: ["mean", "max", "both"] }],
    resolve: ({ c1s, args, n, scale, width, maxChannels }) => {
      // YOLOv13 parse_model: c1 = ch[f[1]]; hyperedges halved for n and ×1.5 for x; no channel adjust for l/x
      const c2 = makeDivisible(Math.min(num(args[0], 0), maxChannels) * width, 8);
      let he = num(args[1], 8);
      if (scale === "n") he = Math.trunc(he * 0.5);
      else if (scale === "x") he = Math.trunc(he * 1.5);
      const out: YamlValue[] = [c1s[1] ?? 0, c2, n, he, ...args.slice(2)];
      if (scale === "l" || scale === "x") out.push(false);
      return { args: out, c2, n: 1 };
    },
    build: (b, ins, a) => M.HyperACE(b, "hyperace", ins, num(a[1], 0), num(a[2], 1), num(a[3], 8), bool(a[4], true), bool(a[5], false), num(a[6], 0.5), num(a[7], 1), bool(a[9], true)),
  },
  {
    id: "DownsampleConv", yamlName: "DownsampleConv", displayName: "DownsampleConv", category: "downsample", parse: "custom", inputs: one, introducedIn: "13",
    args: [],
    resolve: ({ c1s, scale }) => {
      const c1 = c1s[0] ?? 0;
      const lx = scale === "l" || scale === "x";
      return { args: lx ? [c1, false] : [c1], c2: lx ? c1 : c1 * 2, n: 1 };
    },
    build: (b, [x], a) => M.DownsampleConv(b, "downsampleconv", x!, bool(a[1], true)),
  },
  {
    id: "FullPAD_Tunnel", yamlName: "FullPAD_Tunnel", displayName: "FullPAD tunnel", category: "merge", parse: "custom", inputs: { min: 2, max: 2 }, introducedIn: "13",
    args: [],
    resolve: ({ c1s }) => ({ args: [], c2: c1s[0] ?? 0, n: 1 }),
    build: (b, ins) => M.FullPADTunnel(b, "fullpad", ins),
  },
  // ------------------------------------------------------------ attention
  {
    id: "C2PSA", yamlName: "C2PSA", displayName: "C2PSA", category: "attention", parse: "base", repeatModule: true, inputs: one, introducedIn: "11",
    args: [C2()],
    build: (b, [x], a) => M.C2PSA(b, "c2psa", x!, num(a[1], 0), num(a[2], 1), num(a[3], 0.5)),
  },
  {
    id: "C2fPSA", yamlName: "C2fPSA", displayName: "C2fPSA", category: "attention", parse: "base", repeatModule: true, inputs: one,
    args: [C2()],
    build: (b, [x], a) => M.C2fPSA(b, "c2fpsa", x!, num(a[1], 0), num(a[2], 1), num(a[3], 0.5)),
  },
  {
    id: "PSA", yamlName: "PSA", displayName: "PSA", category: "attention", parse: "base", inputs: one, introducedIn: "v10",
    args: [C2()],
    build: (b, [x], a) => M.PSA(b, "psa", x!, num(a[1], 0), num(a[2], 0.5)),
  },
  // ------------------------------------------------------------ pooling / downsampling
  {
    id: "SPPF", yamlName: "SPPF", displayName: "SPPF", category: "pooling", parse: "base", inputs: one,
    args: [C2(), { name: "k", label: "Pool size", kind: "int", default: 5, min: 3, max: 13, step: 2 }, { name: "n", label: "Pool repeats", kind: "int", default: 3 }, { name: "shortcut", label: "Shortcut", kind: "bool", default: false }],
    // parse_model: rows with <= 3 constructor args keep the older activated cv1 (pre-YOLO26)
    build: (b, [x], a) => M.SPPF(b, "sppf", x!, num(a[1], 0), num(a[2], 5), num(a[3], 3), bool(a[4], false), a.length <= 3),
  },
  {
    id: "SPP", yamlName: "SPP", displayName: "SPP", category: "pooling", parse: "base", inputs: one,
    args: [C2(), { name: "k", label: "Pool sizes", kind: "intlist", default: [5, 9, 13] }],
    build: (b, [x], a) => M.SPP(b, "spp", x!, num(a[1], 0), Array.isArray(a[2]) ? (a[2] as number[]) : [5, 9, 13]),
  },
  {
    id: "SPPELAN", yamlName: "SPPELAN", displayName: "SPPELAN", category: "pooling", parse: "base", inputs: one, introducedIn: "v9",
    args: [C2(), { name: "c3", label: "Inner width", kind: "int" }, { name: "k", label: "Pool size", kind: "int", default: 5 }],
    build: (b, [x], a) => M.SPPELAN(b, "sppelan", x!, num(a[1], 0), num(a[2], 0), num(a[3], 5)),
  },
  {
    id: "ADown", yamlName: "ADown", displayName: "ADown", category: "downsample", parse: "base", inputs: one, introducedIn: "v9",
    args: [C2()],
    build: (b, [x], a) => M.ADown(b, "adown", x!, num(a[1], 0)),
  },
  {
    id: "AConv", yamlName: "AConv", displayName: "AConv", category: "downsample", parse: "base", inputs: one, introducedIn: "v9",
    args: [C2()],
    build: (b, [x], a) => M.AConv(b, "aconv", x!, num(a[1], 0)),
  },
  {
    id: "SCDown", yamlName: "SCDown", displayName: "SCDown", category: "downsample", parse: "base", inputs: one, introducedIn: "v10",
    args: [C2(), { name: "k", label: "Kernel size", kind: "int", default: 3 }, { name: "s", label: "Stride", kind: "int", default: 2 }],
    build: (b, [x], a) => M.SCDown(b, "scdown", x!, num(a[1], 0), num(a[2], 3), num(a[3], 2)),
  },
  // ------------------------------------------------------------ resampling / merging
  {
    id: "Upsample", yamlName: "nn.Upsample", displayName: "Upsample", category: "resample", parse: "passthrough", inputs: one,
    args: [{ name: "size", label: "Target size", kind: "none", default: null }, { name: "scale", label: "Scale factor", kind: "int", default: 2, min: 2, max: 4 }, { name: "mode", label: "Mode", kind: "enum", default: "nearest", options: ["nearest", "bilinear"] }],
    build: (b, [x], a) => b.upsample("upsample", x!, num(a[1], 2), typeof a[2] === "string" ? a[2] : "nearest"),
  },
  {
    id: "Concat", yamlName: "Concat", displayName: "Concat", category: "merge", parse: "concat", inputs: { min: 2, max: 8 },
    args: [{ name: "d", label: "Dimension", kind: "int", default: 1 }],
    build: (b, ins) => b.concat("cat", ins, 0),
  },
  {
    id: "Identity", yamlName: "nn.Identity", displayName: "Identity", category: "resample", parse: "passthrough", inputs: one,
    args: [],
    build: (b, [x]) => b.act("identity", x!, "Identity"),
  },
  {
    id: "CBLinear", yamlName: "CBLinear", displayName: "CBLinear", category: "conv", parse: "cblinear", inputs: one, introducedIn: "v9",
    args: [{ name: "c2s", label: "Output widths", kind: "intlist" }],
    build: (b, [x], a) => M.CBLinear(b, "cblinear", x!, (a[1] as number[]) ?? [], num(a[2], 1), num(a[3], 1), nOrNull(a[4]), num(a[5], 1)),
  },
  {
    id: "CBFuse", yamlName: "CBFuse", displayName: "CBFuse", category: "merge", parse: "cbfuse", inputs: { min: 2, max: 8 }, introducedIn: "v9",
    args: [{ name: "idx", label: "Which piece to take from each input", kind: "intlist" }],
    selectInputs: (ins, a) => {
      const idx = (a[0] as number[]) ?? [];
      return ins.map((t, i) => (i < ins.length - 1 ? t[idx[i] ?? 0]! : t[0]!));
    },
    build: (b, ins) => M.CBFuse(b, "cbfuse", ins),
  },
  // ------------------------------------------------------------ heads
  {
    id: "Detect", yamlName: "Detect", displayName: "Detect head", category: "head", parse: "head", inputs: { min: 1, max: 6 }, isHead: true,
    args: [{ name: "nc", label: "Number of classes", kind: "nc", default: "nc" }],
    build: (b, ins, a, ctx) => M.detectCore(b, ins, { nc: num(a[0], ctx.nc), regMax: num(a[1], 16), end2end: bool(a[2], false), legacy: ctx.legacy }),
  },
  {
    id: "v10Detect", yamlName: "v10Detect", displayName: "v10Detect (dual head)", category: "head", parse: "v10head", inputs: { min: 1, max: 6 }, isHead: true, introducedIn: "v10",
    args: [{ name: "nc", label: "Number of classes", kind: "nc", default: "nc" }],
    build: (b, ins, a, ctx) => M.detectCore(b, ins, { nc: num(a[0], ctx.nc), regMax: 16, end2end: true, legacy: ctx.legacy, cv3Style: "v10" }),
  },
  {
    id: "Segment", yamlName: "Segment", displayName: "Segment head", category: "head", parse: "head", inputs: { min: 1, max: 6 }, isHead: true,
    args: [{ name: "nc", label: "Number of classes", kind: "nc", default: "nc" }, { name: "nm", label: "Mask prototypes", kind: "int", default: 32 }, { name: "npr", label: "Prototype channels", kind: "int", default: 256 }],
    build: (b, ins, a, ctx) => {
      const nm = num(a[1], 32), npr = num(a[2], 256);
      const c4 = Math.max(Math.floor(ins[0]!.shape[0]! / 4), nm);
      return M.detectCore(b, ins, { nc: num(a[0], ctx.nc), regMax: num(a[3], 16), end2end: bool(a[4], false), legacy: ctx.legacy }, (q, prefix, xs) => {
        const masks = M.extraBranch(q, `${prefix}cv4`, xs, c4, nm);
        if (prefix) return {};
        const proto = M.Proto(q, "proto", xs[0]!, npr, nm);
        return { mask_coefficients: M.flatCat(q, "mask_coef", masks), prototypes: proto };
      });
    },
  },
  {
    id: "Segment26", yamlName: "Segment26", displayName: "Segment26 head", category: "head", parse: "head", inputs: { min: 1, max: 6 }, isHead: true, introducedIn: "26",
    args: [{ name: "nc", label: "Number of classes", kind: "nc", default: "nc" }, { name: "nm", label: "Mask prototypes", kind: "int", default: 32 }, { name: "npr", label: "Prototype channels", kind: "int", default: 256 }],
    build: (b, ins, a, ctx) => {
      const nm = num(a[1], 32), npr = num(a[2], 256), nc = num(a[0], ctx.nc);
      const c4 = Math.max(Math.floor(ins[0]!.shape[0]! / 4), nm);
      return M.detectCore(b, ins, { nc, regMax: num(a[3], 16), end2end: bool(a[4], false), legacy: ctx.legacy }, (q, prefix, xs) => {
        const masks = M.extraBranch(q, `${prefix}cv4`, xs, c4, nm);
        if (prefix) return {};
        const proto = M.Proto26(q, "proto", xs, npr, nm, nc);
        return { mask_coefficients: M.flatCat(q, "mask_coef", masks), prototypes: proto };
      });
    },
  },
  {
    id: "Pose26", yamlName: "Pose26", displayName: "Pose26 head (RLE)", category: "head", parse: "head", inputs: { min: 1, max: 6 }, isHead: true, introducedIn: "26",
    args: [{ name: "nc", label: "Number of classes", kind: "nc", default: "nc" }, { name: "kpt_shape", label: "Keypoints [count, dims]", kind: "kpt", default: "kpt_shape" }],
    build: (b, ins, a, ctx) => {
      const kpt = (Array.isArray(a[1]) ? a[1] : ctx.kptShape ?? [17, 3]) as [number, number];
      const nk = kpt[0] * kpt[1], nkSigma = kpt[0] * 2;
      const c4 = Math.max(Math.floor(ins[0]!.shape[0]! / 4), kpt[0] * (kpt[1] + 2));
      return M.detectCore(b, ins, { nc: num(a[0], ctx.nc), regMax: num(a[2], 16), end2end: bool(a[3], false), legacy: ctx.legacy }, (q, prefix, xs) => {
        const feats = M.extraBranch(q, `${prefix}cv4`, xs, c4, null);
        if (!prefix) M.RealNVP(q, "flow_model", feats[0]!);
        const k = q.groupN(`${prefix}cv4_kpts`, "ModuleList", feats, (s, fs) => fs.map((f, i) => s.conv2d(String(i), f!, { c2: nk, k: 1, bias: true })));
        // per-keypoint uncertainty (sigma) feeds the RLE loss only
        q.groupN(`${prefix}cv4_sigma`, "ModuleList", feats, (s, fs) => fs.map((f, i) => s.conv2d(String(i), f!, { c2: nkSigma, k: 1, bias: true })), { inactive: true });
        return prefix ? {} : { keypoints: M.flatCat(q, "kpts", k) };
      });
    },
  },
  {
    id: "OBB26", yamlName: "OBB26", displayName: "OBB26 head", category: "head", parse: "head", inputs: { min: 1, max: 6 }, isHead: true, introducedIn: "26",
    args: [{ name: "nc", label: "Number of classes", kind: "nc", default: "nc" }, { name: "ne", label: "Angle outputs", kind: "int", default: 1 }],
    build: (b, ins, a, ctx) => {
      const ne = num(a[1], 1);
      const c4 = Math.max(Math.floor(ins[0]!.shape[0]! / 4), ne);
      return M.detectCore(b, ins, { nc: num(a[0], ctx.nc), regMax: num(a[2], 16), end2end: bool(a[3], false), legacy: ctx.legacy }, (q, prefix, xs) => {
        const k = M.extraBranch(q, `${prefix}cv4`, xs, c4, ne);
        return prefix ? {} : { angle: M.flatCat(q, "angle", k) };
      });
    },
  },
  {
    id: "Pose", yamlName: "Pose", displayName: "Pose head", category: "head", parse: "head", inputs: { min: 1, max: 6 }, isHead: true,
    args: [{ name: "nc", label: "Number of classes", kind: "nc", default: "nc" }, { name: "kpt_shape", label: "Keypoints [count, dims]", kind: "kpt", default: "kpt_shape" }],
    build: (b, ins, a, ctx) => {
      const kpt = (Array.isArray(a[1]) ? a[1] : ctx.kptShape ?? [17, 3]) as [number, number];
      const nk = kpt[0] * kpt[1];
      const c4 = Math.max(Math.floor(ins[0]!.shape[0]! / 4), nk);
      return M.detectCore(b, ins, { nc: num(a[0], ctx.nc), regMax: num(a[2], 16), end2end: bool(a[3], false), legacy: ctx.legacy }, (q, prefix, xs) => {
        const k = M.extraBranch(q, `${prefix}cv4`, xs, c4, nk);
        return prefix ? {} : { keypoints: M.flatCat(q, "kpts", k) };
      });
    },
  },
  {
    id: "OBB", yamlName: "OBB", displayName: "OBB head", category: "head", parse: "head", inputs: { min: 1, max: 6 }, isHead: true,
    args: [{ name: "nc", label: "Number of classes", kind: "nc", default: "nc" }, { name: "ne", label: "Angle outputs", kind: "int", default: 1 }],
    build: (b, ins, a, ctx) => {
      const ne = num(a[1], 1);
      const c4 = Math.max(Math.floor(ins[0]!.shape[0]! / 4), ne);
      return M.detectCore(b, ins, { nc: num(a[0], ctx.nc), regMax: num(a[2], 16), end2end: bool(a[3], false), legacy: ctx.legacy }, (q, prefix, xs) => {
        const k = M.extraBranch(q, `${prefix}cv4`, xs, c4, ne);
        return prefix ? {} : { angle: M.flatCat(q, "angle", k) };
      });
    },
  },
  {
    id: "Classify", yamlName: "Classify", displayName: "Classify head", category: "head", parse: "classify", inputs: { min: 1, max: 4 }, isHead: true,
    args: [{ name: "c2", label: "Number of classes", kind: "nc", default: "nc" }],
    build: (b, ins, a) => ({ outputs: { probabilities: M.Classify(b, "classify", ins, num(a[1], 1000), num(a[2], 1), num(a[3], 1), nOrNull(a[4]), num(a[5], 1)) } }),
  },
];

export type { Shape };

const byYaml = new Map<string, BlockDefinition>();
const byId = new Map<string, BlockDefinition>();

export function registerBlock(d: BlockDefinition): void {
  byYaml.set(d.yamlName, d);
  byId.set(d.id, d);
}

for (const d of defs) registerBlock(d);

export function getBlock(moduleOrId: string): BlockDefinition | undefined {
  return byYaml.get(moduleOrId) ?? byId.get(moduleOrId) ?? byId.get(moduleOrId.replace(/^nn\./, ""));
}

export function allBlocks(): BlockDefinition[] {
  return [...byId.values()];
}
