/**
 * Build `data/models/<version>.json` from the ground-truth fixtures: the official YAML text, provenance and the
 * measured totals per scale. The web app loads these small files instead of the full fixtures.
 * Run: pnpm --filter @yolo-atlas/core data:build
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FixtureSchema, type Fixture } from "../src/fixtures";
import type { ModelData } from "../src/data";

const ROOT = join(import.meta.dirname, "..");
const FIX = join(ROOT, "fixtures");
const OUT = join(ROOT, "data", "models");
mkdirSync(OUT, { recursive: true });

for (const version of readdirSync(FIX).sort()) {
  const files = readdirSync(join(FIX, version)).filter((f) => f.endsWith(".json")).sort();
  const data: ModelData = { version, tasks: {} };
  for (const f of files) {
    const fx: Fixture = FixtureSchema.parse(JSON.parse(readFileSync(join(FIX, version, f), "utf8")));
    const t = (data.tasks[fx.task] ??= { variants: {} });
    t.variants[fx.scale] = {
      modelName: fx.modelName,
      yamlText: fx.yamlText,
      yamlSha256: fx.source.yamlSha256,
      source: { repo: fx.source.repo, file: fx.source.file, package: fx.source.package, packageVersion: fx.source.packageVersion, commit: fx.source.commit ?? null },
      retrievedAt: fx.retrievedAt,
      inputSize: fx.inputSize,
      measured: { params: fx.totals.params, gflops: fx.totals.gflops, layers: fx.totals.layers },
    };
  }
  writeFileSync(join(OUT, `${version}.json`), JSON.stringify(data, null, 1) + "\n");
  console.log(`data/models/${version}.json: ${Object.keys(data.tasks).join(", ")}`);
}
