import { describe, expect, it } from "vitest";
import { Builder, allBlocks, getBlock, type BuildCtx } from "../src";

const ctx: BuildCtx = { codebase: "ultralytics", nc: 80, regMax: 16, end2end: false, legacy: false, scale: "n", kptShape: null };
const params = (id: string, args: (number | null)[], c = 64, n = 1) => {
  const b = new Builder(Array.from({ length: n }, () => [c, 40, 40]));
  const r = getBlock(id)!.build(b, b.inputs, [c, ...args], ctx);
  return { params: b.nodes.reduce((a, x) => a + x.params, 0), out: Array.isArray(r) || "outputs" in r ? null : r.shape };
};

describe("Lab extras", () => {
  // Parameter counts worked out by hand from the PyTorch stubs (export/stubs.ts).
  it("SE: two 1×1 convs with bias", () => expect(params("SE", [16])).toEqual({ params: 64 * 8 + 8 + 8 * 64 + 64, out: [64, 40, 40] }));
  it("ECA: k weights", () => expect(params("ECA", [3]).params).toBe(3));
  it("CBAM: c·c + c + 2·7·7", () => expect(params("CBAM", [7]).params).toBe(64 * 64 + 64 + 98));
  it("CoordAtt: mip = max(8, c/32)", () => expect(params("CoordAtt", [32]).params).toBe(64 * 8 + 8 + 16 + 2 * (8 * 64 + 64)));
  it("SimAM has no parameters", () => expect(params("SimAM", []).params).toBe(0));
  it("WeightedAdd: one weight per input", () => expect(params("WeightedAdd", [], 64, 3)).toEqual({ params: 3, out: [64, 40, 40] }));
  it("DeformConv: offset/mask conv + main weights + BN", () => {
    const b = new Builder([[64, 40, 40]]);
    getBlock("DeformConv")!.build(b, b.inputs, [64, 128, 3, 2], ctx);
    expect(b.nodes.reduce((a, x) => a + x.params, 0)).toBe(27 * 64 * 9 + 27 + 128 * 64 * 9 + 256);
  });
  it("every extra is flagged as such", () => expect(allBlocks().filter((d) => d.extra).length).toBeGreaterThanOrEqual(7));
});
