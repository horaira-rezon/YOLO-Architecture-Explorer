/**
 * A tiny "module builder" that mirrors how a PyTorch block is constructed and run.
 *
 * Each block definition describes its forward pass with these calls. From that single description we get:
 *  - output shapes,
 *  - parameter counts (same rules as `sum(p.numel())`),
 *  - FLOPs with the same counting rules as `thop` (which Ultralytics uses for GFLOPs),
 *  - the internal sub-graph shown when a learner zooms into a block (L2/L3 views).
 */

export type Shape = number[];

export interface Ref {
  id: string;
  shape: Shape;
}

export type IRKind = "prim" | "group" | "input";

export interface IRNode {
  /** Unique within its parent graph. */
  id: string;
  /** Attribute name in PyTorch (`cv1`, `m.0`, `bn`), or an operation label (`split`, `cat`). */
  name: string;
  /** PyTorch class or operation name (`Conv2d`, `BatchNorm2d`, `Bottleneck`, `split`, `add`). */
  type: string;
  kind: IRKind;
  inputs: string[];
  out: Shape;
  /** Extra outputs for ops returning several tensors (split/chunk). */
  outs?: Shape[];
  params: number;
  /** thop-style operation count (multiply-adds). GFLOPs = 2 × ops / 1e9. */
  ops: number;
  /** Matmul-style ops thop counts globally (not per layer). Included in `ops`. */
  functionalOps: number;
  attrs?: Record<string, number | string | boolean | number[] | null>;
  children?: IRGraph;
  /** Built but not run at inference (e.g. training-only branches). Counts params, not FLOPs. */
  inactive?: boolean;
}

export interface IRGraph {
  inputs: Ref[];
  nodes: IRNode[];
  outputs: string[];
}

const numel = (s: Shape) => s.reduce((a, b) => a * b, 1);

export function convOut(size: number, k: number, s: number, p: number, d = 1): number {
  return Math.floor((size + 2 * p - d * (k - 1) - 1) / s + 1);
}

/** Ultralytics `autopad`. */
export function autopad(k: number, p: number | null | undefined, d = 1): number {
  const ke = d > 1 ? d * (k - 1) + 1 : k;
  return p == null ? Math.floor(ke / 2) : p;
}

export interface GroupOpts {
  inactive?: boolean;
  attrs?: IRNode["attrs"];
}

export interface Conv2dOpts {
  c2: number;
  k?: number;
  s?: number;
  p?: number;
  g?: number;
  d?: number;
  bias?: boolean;
}

export class Builder {
  readonly nodes: IRNode[] = [];
  readonly inputs: Ref[];
  private counter = 0;
  /** When false, ops recorded are params-only (the branch never runs at inference). */
  private active = true;

  constructor(inputShapes: Shape[]) {
    this.inputs = inputShapes.map((shape, i) => ({ id: `in${i}`, shape }));
  }

  in(i = 0): Ref {
    const r = this.inputs[i];
    if (!r) throw new Error(`block has no input #${i}`);
    return r;
  }

  private uid(name: string): string {
    const base = name.replace(/[^a-zA-Z0-9_.]/g, "_") || "op";
    const id = this.nodes.some((n) => n.id === base) ? `${base}#${++this.counter}` : base;
    return id;
  }

  private push(n: Omit<IRNode, "id" | "functionalOps"> & { functionalOps?: number }): Ref {
    const id = this.uid(n.name);
    const node: IRNode = { functionalOps: 0, ...n, id };
    if (!this.active) {
      node.inactive = true;
      node.ops = 0;
      node.functionalOps = 0;
    }
    this.nodes.push(node);
    return { id, shape: n.out };
  }

  // ---------------------------------------------------------------- primitives

  conv2d(name: string, x: Ref, o: Conv2dOpts): Ref {
    const [c1, h, w] = x.shape as [number, number, number];
    const k = o.k ?? 1, s = o.s ?? 1, g = o.g ?? 1, d = o.d ?? 1;
    const p = o.p ?? autopad(k, null, d);
    if (c1 % g !== 0 || o.c2 % g !== 0) throw new Error(`Conv2d groups=${g} must divide ${c1} and ${o.c2}`);
    const out = [o.c2, convOut(h, k, s, p, d), convOut(w, k, s, p, d)];
    const params = o.c2 * (c1 / g) * k * k + (o.bias ? o.c2 : 0);
    const ops = numel(out) * (c1 / g) * k * k;
    return this.push({
      name, type: "Conv2d", kind: "prim", inputs: [x.id], out, params, ops,
      attrs: { c1, c2: o.c2, k, s, p, g, d, bias: !!o.bias },
    });
  }

  convTranspose2d(name: string, x: Ref, c2: number, k: number, s: number, bias = true): Ref {
    const [c1, h, w] = x.shape as [number, number, number];
    const out = [c2, (h - 1) * s + k, (w - 1) * s + k];
    const params = c1 * c2 * k * k + (bias ? c2 : 0);
    const ops = numel(x.shape) * c2 * k * k;
    return this.push({ name, type: "ConvTranspose2d", kind: "prim", inputs: [x.id], out, params, ops, attrs: { c1, c2, k, s, bias } });
  }

  bn(name: string, x: Ref): Ref {
    const c = x.shape[0]!;
    return this.push({ name, type: "BatchNorm2d", kind: "prim", inputs: [x.id], out: x.shape, params: 2 * c, ops: 4 * numel(x.shape), attrs: { c } });
  }

  /** Activation module (SiLU, Sigmoid, ReLU, Identity…). thop counts these as zero. */
  act(name: string, x: Ref, type = "SiLU"): Ref {
    return this.push({ name, type, kind: "prim", inputs: [x.id], out: x.shape, params: 0, ops: 0 });
  }

  maxpool(name: string, x: Ref, k: number, s: number, p: number, functional = false): Ref {
    const [c, h, w] = x.shape as [number, number, number];
    const out = [c, convOut(h, k, s, p), convOut(w, k, s, p)];
    return this.push({ name, type: functional ? "max_pool2d" : "MaxPool2d", kind: "prim", inputs: [x.id], out, params: 0, ops: 0, attrs: { k, s, p } });
  }

  /** Functional `avg_pool2d` (not counted by thop). */
  avgpool(name: string, x: Ref, k: number, s: number, p: number): Ref {
    const [c, h, w] = x.shape as [number, number, number];
    const out = [c, convOut(h, k, s, p), convOut(w, k, s, p)];
    return this.push({ name, type: "avg_pool2d", kind: "prim", inputs: [x.id], out, params: 0, ops: 0, attrs: { k, s, p } });
  }

  /** `nn.AvgPool2d` module (counted by thop: one add per input in a window + one divide per output). */
  avgPoolModule(name: string, x: Ref, k: number, s = k): Ref {
    const [c, h, w] = x.shape as [number, number, number];
    const oh = convOut(h, k, s, 0), ow = convOut(w, k, s, 0);
    const win = (size: number, o: number) => Array.from({ length: o }, (_, i) => Math.min(i * s + k, size) - i * s).reduce((a, v) => a + v, 0);
    const out = [c, oh, ow];
    return this.push({ name, type: "AvgPool2d", kind: "prim", inputs: [x.id], out, params: 0, ops: c * win(h, oh) * win(w, ow) + numel(out), attrs: { k, s } });
  }

  adaptiveAvgPool(name: string, x: Ref): Ref {
    const out = [x.shape[0]!, 1, 1];
    return this.push({ name, type: "AdaptiveAvgPool2d", kind: "prim", inputs: [x.id], out, params: 0, ops: numel(x.shape) + numel(out) });
  }

  upsample(name: string, x: Ref, scale: number, mode = "nearest", functional = false): Ref {
    const [c, h, w] = x.shape as [number, number, number];
    const out = [c, Math.floor(h * scale), Math.floor(w * scale)];
    return this.push({ name, type: functional ? "interpolate" : "Upsample", kind: "prim", inputs: [x.id], out, params: 0, ops: 0, attrs: { scale, mode } });
  }

  linear(name: string, x: Ref, c2: number, bias = true): Ref {
    const c1 = x.shape[x.shape.length - 1]!;
    const out = [...x.shape.slice(0, -1), c2];
    return this.push({ name, type: "Linear", kind: "prim", inputs: [x.id], out, params: c1 * c2 + (bias ? c2 : 0), ops: c1 * numel(out), attrs: { c1, c2, bias } });
  }

  dropout(name: string, x: Ref, p: number): Ref {
    return this.push({ name, type: "Dropout", kind: "prim", inputs: [x.id], out: x.shape, params: 0, ops: 0, attrs: { p } });
  }

  concat(name: string, xs: Ref[], dim = 0): Ref {
    const first = xs[0];
    if (!first) throw new Error("concat needs inputs");
    const out = [...first.shape];
    for (const x of xs.slice(1)) {
      if (x.shape.length !== out.length || x.shape.some((v, i) => i !== dim && v !== out[i]))
        throw new Error(`cannot join ${fmt(first.shape)} with ${fmt(x.shape)}: sizes differ`);
      out[dim] = out[dim]! + x.shape[dim]!;
    }
    return this.push({ name, type: "cat", kind: "prim", inputs: xs.map((x) => x.id), out, params: 0, ops: 0, attrs: { dim } });
  }

  split(name: string, x: Ref, sizes: number[], dim = 0): Ref[] {
    const total = sizes.reduce((a, b) => a + b, 0);
    if (total !== x.shape[dim]) throw new Error(`split ${sizes.join("+")} does not match ${x.shape[dim]}`);
    const outs = sizes.map((s) => x.shape.map((v, i) => (i === dim ? s : v)));
    const r = this.push({ name, type: "split", kind: "prim", inputs: [x.id], out: outs[0]!, outs, params: 0, ops: 0, attrs: { sizes, dim } });
    return outs.map((shape, i) => ({ id: i === 0 ? r.id : `${r.id}:${i}`, shape }));
  }

  /** Elementwise op on equal shapes (add, mul…). Python operators are not counted by thop. */
  elementwise(name: string, type: string, xs: Ref[], out?: Shape): Ref {
    return this.push({ name, type, kind: "prim", inputs: xs.map((x) => x.id), out: out ?? xs[0]!.shape, params: 0, ops: 0 });
  }

  add(name: string, a: Ref, b: Ref): Ref {
    if (fmt(a.shape) !== fmt(b.shape)) throw new Error(`cannot add ${fmt(a.shape)} and ${fmt(b.shape)}`);
    return this.elementwise(name, "add", [a, b]);
  }

  /** Reshape / view / permute / flatten — free, but shown at L3 so learners see the layout change. */
  reshape(name: string, x: Ref, out: Shape, type = "view"): Ref {
    return this.push({ name, type, kind: "prim", inputs: [x.id], out, params: 0, ops: 0 });
  }

  /** Functional matrix product `a @ b` (counted by thop globally): ops = numel(out) × inner. */
  matmul(name: string, a: Ref, b: Ref, out: Shape, inner: number): Ref {
    const ops = numel(out) * inner;
    return this.push({ name, type: "matmul", kind: "prim", inputs: [a.id, b.id], out, params: 0, ops, functionalOps: ops });
  }

  softmax(name: string, x: Ref, dim: number): Ref {
    return this.push({ name, type: "softmax", kind: "prim", inputs: [x.id], out: x.shape, params: 0, ops: 0, attrs: { dim } });
  }

  /** Any other primitive, with its counts given explicitly (Lab extras such as Conv1d or deformable conv). */
  prim(name: string, type: string, xs: Ref[], out: Shape, params: number, ops: number, attrs?: IRNode["attrs"]): Ref {
    return this.push({ name, type, kind: "prim", inputs: xs.map((x) => x.id), out, params, ops, attrs });
  }

  /** A learnable tensor owned directly by the block (e.g. A2C2f `gamma`). */
  param(name: string, count: number): void {
    this.push({ name, type: "Parameter", kind: "prim", inputs: [], out: [count], params: count, ops: 0 });
  }

  // ---------------------------------------------------------------- composites

  /** Run `fn` as a nested module (shown as one box until expanded). */
  group(name: string, type: string, xs: Ref[], fn: (b: Builder, ins: Ref[]) => Ref | Ref[], opts: GroupOpts = {}): Ref {
    return this.groupN(name, type, xs, fn, opts)[0]!;
  }

  /** Like `group`, but returns every output (output j > 0 is addressed as `<id>:<j>`). */
  groupN(name: string, type: string, xs: Ref[], fn: (b: Builder, ins: Ref[]) => Ref | Ref[], opts: GroupOpts = {}): Ref[] {
    const child = new Builder(xs.map((x) => x.shape));
    child.active = this.active && !opts.inactive;
    const res = fn(child, child.inputs);
    const outs = Array.isArray(res) ? res : [res];
    if (!outs.length) throw new Error(`${type} produced no output`);
    const graph: IRGraph = { inputs: child.inputs, nodes: child.nodes, outputs: outs.map((o) => o.id) };
    const { params, ops, functionalOps } = sumGraph(graph);
    const r = this.push({
      name, type, kind: "group", inputs: xs.map((x) => x.id), out: outs[0]!.shape,
      outs: outs.length > 1 ? outs.map((o) => o.shape) : undefined,
      params, ops, functionalOps, children: graph, attrs: opts.attrs,
    });
    return outs.map((o, j) => ({ id: j === 0 ? r.id : `${r.id}:${j}`, shape: o.shape }));
  }

  /** Mark following calls as params-only (module exists but does not run in inference). */
  withInactive<T>(fn: () => T): T {
    const prev = this.active;
    this.active = false;
    try {
      return fn();
    } finally {
      this.active = prev;
    }
  }

  graph(outputs: Ref[]): IRGraph {
    return { inputs: this.inputs, nodes: this.nodes, outputs: outputs.map((o) => o.id) };
  }
}

export function fmt(s: Shape): string {
  return s.join("×");
}

export function sumGraph(g: IRGraph): { params: number; ops: number; functionalOps: number } {
  return g.nodes.reduce(
    (a, n) => ({ params: a.params + n.params, ops: a.ops + n.ops, functionalOps: a.functionalOps + n.functionalOps }),
    { params: 0, ops: 0, functionalOps: 0 },
  );
}
