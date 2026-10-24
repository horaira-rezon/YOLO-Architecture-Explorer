import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FixtureSchema, VERSIONS, type ModelData } from "../src";

const ROOT = join(__dirname, "..");

describe("generated model data", () => {
  it("is up to date with the fixtures (run `pnpm --filter @yolo-atlas/core data:build`)", () => {
    for (const v of readdirSync(join(ROOT, "fixtures"))) {
      const data = JSON.parse(readFileSync(join(ROOT, "data", "models", `${v}.json`), "utf8")) as ModelData;
      for (const f of readdirSync(join(ROOT, "fixtures", v))) {
        const fx = FixtureSchema.parse(JSON.parse(readFileSync(join(ROOT, "fixtures", v, f), "utf8")));
        const variant = data.tasks[fx.task]?.variants[fx.scale];
        expect(variant?.yamlSha256, `${v}/${f}`).toBe(fx.source.yamlSha256);
        expect(variant?.measured.params).toBe(fx.totals.params);
      }
    }
  });

  it("covers every released catalogue task with data", () => {
    for (const v of VERSIONS.filter((x) => x.status === "released")) {
      const data = JSON.parse(readFileSync(join(ROOT, "data", "models", `${v.id}.json`), "utf8")) as ModelData;
      for (const [task, sup] of Object.entries(v.tasks)) {
        expect(!!data.tasks[task as keyof ModelData["tasks"]], `${v.id} ${task}`).toBe(sup.supported);
      }
    }
  });
});

describe("provenance", () => {
  it("every model variant names its repo, file, package version and YAML hash", () => {
    for (const f of readdirSync(join(ROOT, "data", "models"))) {
      const data = JSON.parse(readFileSync(join(ROOT, "data", "models", f), "utf8")) as ModelData;
      for (const t of Object.values(data.tasks)) for (const v of Object.values(t!.variants)) {
        expect(v.source.repo).toMatch(/^https:\/\/github\.com\//);
        expect(v.source.file).toMatch(/\.yaml$/);
        expect(v.source.packageVersion).toMatch(/^\d+\.\d+\.\d+/);
        expect(v.yamlSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(v.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
  it("every released version cites at least one official source; drafts say why", () => {
    for (const v of VERSIONS) {
      expect(v.sources.length, v.id).toBeGreaterThan(0);
      if (v.confidence === "draft") expect(v.notes.length, v.id).toBeGreaterThan(0);
    }
  });
});
