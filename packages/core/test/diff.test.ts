import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileYaml, compareSummary, computeArchitecture, diffAligned, diffById, type ModelData } from "../src";

const load = (v: string, scale = "n") => {
  const d = JSON.parse(readFileSync(join(__dirname, "..", "data", "models", `${v}.json`), "utf8")) as ModelData;
  const x = d.tasks.detect!.variants[scale]!;
  return compileYaml(x.yamlText, { version: v, task: "detect", scale: /^scales:/m.test(x.yamlText) ? scale : null, meta: { source: x.source, confidence: "verified", retrievedAt: x.retrievedAt, notes: [] } });
};

describe("diff", () => {
  it("YOLOv8 → YOLO11: C2f becomes C3k2, C2PSA is new", () => {
    const a = load("v8"), b = load("11");
    const d = diffAligned(a, b, computeArchitecture(a), computeArchitecture(b));
    const s = compareSummary(d, a, b);
    expect(s.newBlocks).toEqual(expect.arrayContaining(["C3k2", "C2PSA"]));
    expect(s.droppedBlocks).toContain("C2f");
    expect(s.counts.added).toBe(1); // C2PSA at the end of the backbone
    expect(d.filter((x) => x.kind === "changed").some((x) => x.changes.some((c) => c.includes("C2f → C3k2")))).toBe(true);
  });

  it("same graph by id is all 'same'", () => {
    const a = load("v8");
    expect(diffById(a, structuredClone(a)).every((x) => x.kind === "same")).toBe(true);
  });
});
