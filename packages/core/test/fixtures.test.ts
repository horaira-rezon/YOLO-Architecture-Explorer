import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FixtureSchema, architectureFromFixture, computeArchitecture } from "../src";

const DIR = join(__dirname, "..", "fixtures");
const files = existsSync(DIR)
  ? readdirSync(DIR).flatMap((v) => readdirSync(join(DIR, v)).filter((f) => f.endsWith(".json")).map((f) => join(v, f)))
  : [];

/**
 * Fixtures whose blocks are not modelled yet (milestone M5). Listed explicitly so they show as "todo"
 * instead of silently passing; this list must be empty when M5 is done.
 */
const PENDING = new Set<string>([
  ...["n", "s", "l", "x"].map((s) => `13/detect-${s}.json`),
  ...["segment", "pose", "obb"].flatMap((t) => ["n", "s", "m", "l", "x"].map((s) => `26/${t}-${s}.json`)),
]);

for (const f of files.filter((f) => PENDING.has(f))) it.todo(`fixture ${f} (blocks not modelled yet)`);

/** Engine output shape vs the PyTorch hook shape (heads report several tensors; compare the backbone/neck exactly). */
describe.each(files.filter((f) => !PENDING.has(f)))("fixture %s", (file) => {
  const fx = FixtureSchema.parse(JSON.parse(readFileSync(join(DIR, file), "utf8")));
  const arch = architectureFromFixture(fx);
  const res = computeArchitecture(arch);

  it("builds without errors", () => {
    expect(res.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("matches every layer's output shape exactly", () => {
    const bad: string[] = [];
    for (const l of fx.layers) {
      const node = arch.nodes[l.index]!;
      if (node.stage === "head") continue;
      const c = res.nodes[node.id]!;
      const got = Array.isArray((l.outShape as unknown[])?.[0]) ? c.tupleShapes : c.outShape;
      if (JSON.stringify(got) !== JSON.stringify(l.outShape)) bad.push(`#${l.index} ${l.module}: got ${JSON.stringify(got)} want ${JSON.stringify(l.outShape)}`);
    }
    expect(bad).toEqual([]);
  });

  it("matches every layer's parameter count", () => {
    const bad: string[] = [];
    for (const l of fx.layers) {
      const got = res.nodes[arch.nodes[l.index]!.id]!.params;
      if (got !== l.params) bad.push(`#${l.index} ${l.module}: got ${got} want ${l.params}`);
    }
    expect(bad).toEqual([]);
    expect(Math.abs(res.totals.params - fx.totals.params) / fx.totals.params).toBeLessThanOrEqual(0.01);
  });

  it("matches per-layer FLOPs (thop rules) and total GFLOPs within 1%", () => {
    const bad: string[] = [];
    for (const l of fx.layers) {
      const c = res.nodes[arch.nodes[l.index]!.id]!;
      const got = c.flops - c.functionalFlops; // thop reports functional matmuls globally, not per layer
      if (Math.abs(got - l.flops) > Math.max(1, l.flops * 1e-6)) bad.push(`#${l.index} ${l.module}: got ${got} want ${l.flops}`);
    }
    expect(bad).toEqual([]);
    expect(Math.abs(res.totals.gflops - fx.totals.thopGflops) / fx.totals.thopGflops).toBeLessThanOrEqual(0.01);
  });
});
