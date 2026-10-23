import type { IRGraph, IRNode, Shape } from "./builder";

export interface FlatNode {
  /** Dotted path from the block root, e.g. `m.0.cv1.conv`. */
  id: string;
  name: string;
  type: string;
  kind: IRNode["kind"];
  out: Shape;
  outs?: Shape[];
  params: number;
  ops: number;
  attrs?: IRNode["attrs"];
  /** Has children that can be expanded further. */
  expandable: boolean;
  inactive?: boolean;
  depth: number;
}

export interface FlatEdge {
  id: string;
  source: string;
  target: string;
  shape: Shape;
}

export interface FlatGraph {
  inputs: { id: string; shape: Shape }[];
  nodes: FlatNode[];
  edges: FlatEdge[];
  outputs: string[];
}

/** The block's own graph: a layer's IR has one top-level group (the block); return its children. */
export function blockGraph(ir: IRGraph): IRGraph {
  if (ir.nodes.length === 1 && ir.nodes[0]!.kind === "group" && ir.nodes[0]!.children) return ir.nodes[0]!.children;
  return ir;
}

/**
 * Expand groups down to `maxDepth` levels (1 = direct children only, Infinity = primitives).
 * Group inputs/outputs are rewired to the inner nodes so edges stay connected.
 */
export function flattenIR(g: IRGraph, maxDepth: number, expandOnly?: Set<string>): FlatGraph {
  const nodes: FlatNode[] = [];
  const edges: FlatEdge[] = [];
  const shapes = new Map<string, Shape>();
  for (const i of g.inputs) shapes.set(i.id, i.shape);

  /** Returns a resolver from local ref ids to flat ids (for this graph's outputs). */
  function walk(graph: IRGraph, prefix: string, depth: number, inputMap: Map<string, string>): (ref: string) => string {
    const local = new Map<string, (j: number) => string>();
    const resolve = (ref: string): string => {
      if (inputMap.has(ref)) return inputMap.get(ref)!;
      const [base, j] = ref.split(":") as [string, string | undefined];
      const f = local.get(base);
      return f ? f(j ? Number(j) : 0) : `${prefix}${ref}`;
    };
    for (const n of graph.nodes) {
      const path = `${prefix}${n.name}`;
      const canExpand = n.kind === "group" && !!n.children && n.children.nodes.length > 0;
      const expand = canExpand && depth < maxDepth && (!expandOnly || expandOnly.has(path) || maxDepth === Infinity);
      if (expand) {
        const inner = new Map<string, string>();
        n.inputs.forEach((ref, k) => inner.set(n.children!.inputs[k]!.id, resolve(ref)));
        const childResolve = walk(n.children!, `${path}.`, depth + 1, inner);
        const outs = n.children!.outputs;
        local.set(n.id, (j) => childResolve(outs[j] ?? outs[0]!));
      } else {
        const id = path;
        nodes.push({
          id, name: n.name, type: n.type, kind: n.kind, out: n.out, outs: n.outs, params: n.params, ops: n.ops,
          attrs: n.attrs, expandable: canExpand, inactive: n.inactive, depth,
        });
        local.set(n.id, (j) => (j > 0 ? `${id}:${j}` : id));
        n.inputs.forEach((ref, k) => {
          const src = resolve(ref);
          edges.push({ id: `${src}->${id}#${k}`, source: src, target: id, shape: shapeOf(src) });
        });
        shapes.set(id, n.out);
        n.outs?.forEach((s, j) => shapes.set(`${id}:${j}`, s));
      }
    }
    return resolve;
  }
  const shapeOf = (ref: string) => shapes.get(ref) ?? [];
  const top = walk(g, "", 1, new Map(g.inputs.map((i) => [i.id, i.id])));
  return { inputs: g.inputs, nodes, edges, outputs: g.outputs.map(top) };
}

/** Parameterised leaf modules as `path:type:params` — comparable with the PyTorch module tree. */
export function parameterLeaves(g: IRGraph, prefix = ""): string[] {
  const out: string[] = [];
  for (const n of g.nodes) {
    const path = `${prefix}${n.name}`;
    if (n.kind === "group" && n.children) out.push(...parameterLeaves(n.children, `${path}.`));
    else if (n.params > 0 && ["Conv2d", "BatchNorm2d", "Linear", "ConvTranspose2d"].includes(n.type)) out.push(`${path}:${n.type}:${n.params}`);
  }
  return out;
}
