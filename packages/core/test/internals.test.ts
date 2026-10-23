import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FixtureSchema, architectureFromFixture, blockGraph, computeArchitecture, flattenIR, parameterLeaves } from "../src";

const DIR = join(__dirname, "..", "fixtures");
const PENDING = /^(13\/|26\/(segment|pose|obb)-)/;
const files = readdirSync(DIR).flatMap((v) => readdirSync(join(DIR, v)).map((f) => join(v, f))).filter((f) => !PENDING.test(f));

interface Tree { name: string; type: string; ownParams?: number; children?: Tree[] }

function torchLeaves(t: Tree, prefix: string): string[] {
  const out: string[] = [];
  for (const c of t.children ?? []) {
    const path = `${prefix}${c.name}`;
    if (c.children?.length) out.push(...torchLeaves(c, `${path}.`));
    else if ((c.ownParams ?? 0) > 0 && ["Conv2d", "BatchNorm2d", "Linear", "ConvTranspose2d"].includes(c.type)) out.push(`${path}:${c.type}:${c.ownParams}`);
  }
  return out;
}

describe("block internals match the PyTorch module tree", () => {
  it.each(files)("%s", (file) => {
    const fx = FixtureSchema.parse(JSON.parse(readFileSync(join(DIR, file), "utf8")));
    const arch = architectureFromFixture(fx);
    const res = computeArchitecture(arch);
    for (const l of fx.layers) {
      const c = res.nodes[arch.nodes[l.index]!.id]!;
      const g = blockGraph(c.ir!);
      // a stacked (n > 1) non-repeat module is an nn.Sequential "0", "1", … in PyTorch, like our "seq" wrapper
      const mine = parameterLeaves(g).map((s) => s.replace(/^seq\./, "")).sort();
      const theirs = torchLeaves(l.tree as Tree, "").sort();
      expect(mine, `layer ${l.index} ${l.module}`).toEqual(theirs);
    }
  });

  it("flattens to primitives with connected edges", () => {
    const fx = FixtureSchema.parse(JSON.parse(readFileSync(join(DIR, "v8/detect-n.json"), "utf8")));
    const arch = architectureFromFixture(fx);
    const res = computeArchitecture(arch);
    const g = blockGraph(res.nodes.n2!.ir!);
    const l2 = flattenIR(g, 1);
    expect(l2.nodes.map((n) => n.name)).toEqual(["cv1", "chunk", "m", "cat", "cv2"]);
    const l3 = flattenIR(g, Infinity);
    expect(l3.nodes.every((n) => n.kind === "prim")).toBe(true);
    const ids = new Set([...l3.nodes.map((n) => n.id), ...l3.inputs.map((i) => i.id)]);
    for (const e of l3.edges) expect(ids.has(e.source.split(":")[0]!), e.source).toBe(true);
    expect(l3.nodes.find((n) => n.id === "m.0.cv1.conv")?.type).toBe("Conv2d");
  });
});
