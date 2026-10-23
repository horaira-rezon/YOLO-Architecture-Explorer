import { z } from "zod";
import type { Architecture, Task } from "./schema";
import { compileYaml } from "./compiler/compile";

/** Shape of `packages/core/fixtures/<version>/<task>-<scale>.json` (written by tools/extract_ground_truth.py). */
export const FixtureLayerSchema = z.object({
  index: z.number(),
  from: z.union([z.number(), z.array(z.number())]),
  repeats: z.number(),
  module: z.string(),
  yamlArgs: z.array(z.unknown()),
  type: z.string(),
  outShape: z.unknown(),
  params: z.number(),
  flops: z.number(),
  tree: z.unknown(),
});

export const FixtureSchema = z.object({
  schemaVersion: z.literal(1),
  version: z.string(),
  task: z.enum(["detect", "segment", "pose", "classify", "obb"]),
  scale: z.string(),
  modelName: z.string(),
  inputSize: z.number(),
  source: z.object({
    package: z.string(),
    packageVersion: z.string(),
    repo: z.string(),
    commit: z.string().nullable().optional(),
    file: z.string(),
    yamlSha256: z.string(),
  }),
  retrievedAt: z.string(),
  yamlText: z.string(),
  config: z.object({ scale: z.string().nullable().optional() }).passthrough(),
  stride: z.array(z.number()),
  totals: z.object({ params: z.number(), gflops: z.number(), thopGflops: z.number(), layers: z.number() }),
  headTrainOut: z.unknown(),
  layers: z.array(FixtureLayerSchema),
});
export type Fixture = z.infer<typeof FixtureSchema>;

/** Build an Architecture from the official YAML recorded in a fixture. */
export function architectureFromFixture(fx: Fixture): Architecture {
  // configs without a `scales:` block (YOLOv9 / v10 per-size files) have no scale letter in the YAML
  const scale = fx.config.scale ?? null;
  return compileYaml(fx.yamlText, {
    version: fx.version,
    task: fx.task as Task,
    scale: scale && fx.yamlText.includes("scales:") ? scale : null,
    inputSize: fx.inputSize,
    meta: {
      source: { repo: fx.source.repo, file: fx.source.file, package: fx.source.package, packageVersion: fx.source.packageVersion, commit: fx.source.commit ?? null },
      confidence: "verified",
      retrievedAt: fx.retrievedAt,
      notes: [],
    },
  });
}
