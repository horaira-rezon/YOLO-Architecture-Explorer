import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  OperationError, applyOperation, compileYaml, computeArchitecture, exportYaml, parseUltralyticsYaml,
  type Architecture, type ModelData,
} from "../src";

const meta = { source: { repo: "test", file: "test" }, confidence: "verified" as const, retrievedAt: "2026-10-24", notes: [] };
const load = (v: string, scale = "n"): Architecture => {
  const d = JSON.parse(readFileSync(join(__dirname, "..", "data", "models", `${v}.json`), "utf8")) as ModelData;
  const x = d.tasks.detect!.variants[scale]!;
  return compileYaml(x.yamlText, { version: v, task: "detect", scale: /^scales:/m.test(x.yamlText) ? scale : null, meta });
};
const ctx = { opId: "t1" };
/** Structure as YAML rows, so graphs with different ids can be compared. */
const rows = (a: Architecture) => {
  const idx = new Map(a.nodes.map((n, i) => [n.id, i]));
  return a.nodes.map((n) => [n.from.map((f) => idx.get(f)), n.repeats, n.module, n.args]);
};
const errors = (a: Architecture) => computeArchitecture(a).issues.filter((i) => i.severity === "error");

describe("operations", () => {
  it.each([["v8", "yolov8-p2.yaml"], ["26", "yolo26-p2.yaml"]])("P2 helper on %s reproduces the official %s", (v, file) => {
    const a = applyOperation(load(v), { op: "addHeadLevel", level: "P2" }, ctx);
    const official = compileYaml(readFileSync(join(__dirname, "assets", file), "utf8"), { version: v, task: "detect", scale: "n", meta });
    expect(rows(a)).toEqual(rows(official));
    expect(errors(a)).toEqual([]);
    expect(computeArchitecture(a).totals).toEqual(computeArchitecture(official).totals);
    // export → import gives the same graph (milestone M6 acceptance)
    const back = compileYaml(exportYaml(a), { version: v, task: "detect", scale: "n", meta });
    expect(rows(back)).toEqual(rows(a));
    expect(a.nodes.filter((n) => n.origin === "added")).toHaveLength(6);
  });

  it("insert keeps the graph valid and rewires consumers; delete can bridge back", () => {
    const a = load("v8");
    const b = applyOperation(a, { op: "insertNode", after: "n9", node: { module: "Conv", args: [1024, 1, 1], repeats: 1 } }, ctx);
    const added = b.nodes.find((n) => n.origin === "added")!;
    expect(b.nodes.indexOf(added)).toBe(10);
    expect(b.nodes.filter((n) => n.from.includes(added.id)).map((n) => n.id).sort()).toEqual(["n10", "n20"]);
    expect(errors(b)).toEqual([]);
    const c = applyOperation(b, { op: "deleteNode", nodeId: added.id, mode: "bridge" }, ctx);
    expect(rows(c)).toEqual(rows(a));
  });

  it("dangling delete reports a plain-language error", () => {
    const b = applyOperation(load("v8"), { op: "deleteNode", nodeId: "n10", mode: "dangling" }, ctx);
    const e = errors(b);
    expect(e.some((x) => /exactly 2 inputs|takes 2 to/.test(x.message) || /input/.test(x.message))).toBe(true);
  });

  it("concat size mismatch is caught with a hint", () => {
    const b = applyOperation(load("v8"), { op: "deleteNode", nodeId: "n10", mode: "bridge" }, ctx);
    expect(errors(b).map((x) => x.message).join(" ")).toMatch(/same height and width/);
  });

  it("removing P5 prunes the now-unused bottom-up path", () => {
    const b = applyOperation(load("v8"), { op: "removeHeadLevel", level: "P5" }, ctx);
    expect(b.nodes.length).toBe(20);
    expect(errors(b)).toEqual([]);
    expect(b.nodes[b.nodes.length - 1]!.from).toEqual(["n15", "n18"]);
  });

  it("duplicate remaps internal links", () => {
    const b = applyOperation(load("v8"), { op: "duplicateNodes", nodeIds: ["n10", "n11"] }, ctx);
    const copies = b.nodes.filter((n) => n.origin === "added");
    expect(copies[1]!.from[0]).toBe(copies[0]!.id);
    expect(copies[1]!.from[1]).toBe("n6");
  });

  it("rejects reading from later layers", () => {
    expect(() => applyOperation(load("v8"), { op: "rewire", nodeId: "n3", from: ["n5"] }, ctx)).toThrow(OperationError);
  });

  it("changes scale, input size, classes and head", () => {
    let a = applyOperation(load("v8"), { op: "changeScale", scale: "s" }, ctx);
    expect(computeArchitecture(a).totals.params).toBeGreaterThan(11_000_000);
    a = applyOperation(a, { op: "changeNc", nc: 4 }, ctx);
    a = applyOperation(a, { op: "changeInputSize", inputSize: 1024 }, ctx);
    a = applyOperation(a, { op: "changeHead", module: "Segment", args: ["nc", 32, 256] }, ctx);
    expect(errors(a)).toEqual([]);
    expect(() => applyOperation(a, { op: "changeInputSize", inputSize: 1000 }, ctx)).toThrow(/multiple of 32/);
    expect(parseUltralyticsYaml(exportYaml(a)).nc).toBe(4);
  });
});

import { validate } from "../src";
describe("validation", () => {
  it("offers a one-click fix for a concat size mismatch that really fixes it", () => {
    const b = applyOperation(load("v8"), { op: "deleteNode", nodeId: "n10", mode: "bridge" }, ctx);
    const issue = validate(b, computeArchitecture(b)).find((i) => i.suggestedFix);
    expect(issue?.suggestedFix?.label).toMatch(/Upsample/);
    const fixed = issue!.suggestedFix!.ops.reduce((a, op) => applyOperation(a, op, ctx), b);
    expect(validate(fixed, computeArchitecture(fixed)).filter((i) => i.severity === "error")).toEqual([]);
  });
  it("official models have no errors or warnings", () => {
    for (const v of ["v8", "v9", "v10", "11", "12", "13", "26"]) {
      const a = load(v, v === "v9" ? "t" : "n");
      expect(validate(a, computeArchitecture(a)), v).toEqual([]);
    }
  });
});
