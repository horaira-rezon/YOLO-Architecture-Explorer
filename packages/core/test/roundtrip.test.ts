import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FixtureSchema, architectureFromFixture, compileYaml, computeArchitecture, exportYaml, makeDivisible, pyRound } from "../src";

const DIR = join(__dirname, "..", "fixtures");
const files = readdirSync(DIR).flatMap((v) => readdirSync(join(DIR, v)).filter((f) => f.endsWith(".json")).map((f) => join(v, f)));

const strip = (a: ReturnType<typeof architectureFromFixture>) =>
  a.nodes.map(({ module, args, repeats, from, section, stage }) => ({ module, args, repeats, from, section, stage }));

describe("YAML round trip (import → export → import)", () => {
  it.each(files)("%s", (file) => {
    const fx = FixtureSchema.parse(JSON.parse(readFileSync(join(DIR, file), "utf8")));
    const a = architectureFromFixture(fx);
    const text = exportYaml(a);
    const b = compileYaml(text, { version: a.version, task: a.task, scale: a.config.scale, inputSize: a.inputSize, meta: a.meta });
    expect(strip(b)).toEqual(strip(a));
    expect(b.config.scales).toEqual(a.config.scales);
    expect(computeArchitecture(b).totals).toEqual(computeArchitecture(a).totals);
  });
});

describe("parse_model helpers", () => {
  it("rounds like Python (ties to even)", () => {
    expect(pyRound(0.5)).toBe(0);
    expect(pyRound(1.5)).toBe(2);
    expect(pyRound(2.5)).toBe(2);
    expect(pyRound(2.97)).toBe(3);
  });
  it("make_divisible rounds up to a multiple of 8", () => {
    expect(makeDivisible(16)).toBe(16);
    expect(makeDivisible(17)).toBe(24);
    expect(makeDivisible(1024 * 0.25)).toBe(256);
  });
});
