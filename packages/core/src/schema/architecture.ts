import { z } from "zod";

export const StageSchema = z.enum(["input", "backbone", "neck", "head", "loss", "postprocess"]);
export type Stage = z.infer<typeof StageSchema>;

export const TaskSchema = z.enum(["detect", "segment", "pose", "classify", "obb"]);
export type Task = z.infer<typeof TaskSchema>;

export const ConfidenceSchema = z.enum(["verified", "draft"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const OriginSchema = z.enum(["builtin", "added", "modified", "removed-ghost"]);
export type Origin = z.infer<typeof OriginSchema>;

/** A YAML argument value as it appears in an Ultralytics config. */
export const YamlValueSchema: z.ZodType<YamlValue> = z.lazy(() =>
  z.union([z.number(), z.string(), z.boolean(), z.null(), z.array(YamlValueSchema)]),
);
export type YamlValue = number | string | boolean | null | YamlValue[];

export const NodeSchema = z.object({
  /** Stable id, never reused. Builtins are `n<index>`; nodes added later get fresh ids. */
  id: z.string().min(1),
  /** Module name as written in YAML, e.g. `Conv`, `nn.Upsample`, `C3k2`. */
  module: z.string().min(1),
  /** Which YAML list the layer lives in. Kept so exports keep the official split. */
  section: z.enum(["backbone", "head"]),
  stage: StageSchema,
  /** YAML args as written (scale-independent, e.g. `[256, False, 0.25]`). */
  args: z.array(YamlValueSchema),
  /** YAML `n` (repeats before the depth multiplier). */
  repeats: z.number().int().min(1),
  /** Input node ids, in order. An empty list means "the network input". */
  from: z.array(z.string()),
  origin: OriginSchema.default("builtin"),
  modification: z.object({ opId: z.string(), summary: z.string() }).optional(),
  /** Free-text comment kept on YAML export (e.g. `P3/8-small`). */
  comment: z.string().optional(),
});
export type ArchNode = z.infer<typeof NodeSchema>;

export const ScaleRowSchema = z.tuple([z.number(), z.number(), z.number()]);

export const ArchConfigSchema = z.object({
  nc: z.number().int().min(1),
  /** Selected scale letter (n/s/m/l/x/…), or null for configs without a `scales:` block. */
  scale: z.string().nullable(),
  scales: z.record(z.string(), ScaleRowSchema).nullable(),
  /** For configs without `scales:` (e.g. YOLOv9): plain multipliers. */
  depthMultiple: z.number().default(1),
  widthMultiple: z.number().default(1),
  maxChannels: z.number().nullable().default(null),
  regMax: z.number().int().nullable().default(null),
  end2end: z.boolean().nullable().default(null),
  kptShape: z.tuple([z.number(), z.number()]).nullable().default(null),
  activation: z.string().nullable().default(null),
  /** Which code base's parse_model rules apply (YOLOv13 ships its own Ultralytics fork). */
  codebase: z.enum(["ultralytics", "yolov13"]).default("ultralytics"),
  /** Other top-level YAML keys we do not interpret but must preserve on export. */
  extra: z.record(z.string(), z.unknown()).default({}),
});
export type ArchConfig = z.infer<typeof ArchConfigSchema>;

export const LossItemSchema = z.object({
  id: z.string(),
  kind: z.string(),
  weight: z.number().optional(),
  note: z.string().optional(),
});

export type LossItem = z.infer<typeof LossItemSchema>;

export const TrainingSchema = z.object({
  losses: z.array(LossItemSchema),
  assigner: z.string(),
  optimizerNote: z.string().optional(),
  extras: z.array(z.string()).default([]),
});
export type Training = z.infer<typeof TrainingSchema>;

export const PostprocessSchema = z.object({
  nms: z.boolean(),
  confThreshold: z.number().min(0).max(1),
  iouThreshold: z.number().min(0).max(1),
  maxDet: z.number().int().min(1).default(300),
});
export type Postprocess = z.infer<typeof PostprocessSchema>;

export const SourceSchema = z.object({
  repo: z.string(),
  file: z.string(),
  package: z.string().optional(),
  packageVersion: z.string().optional(),
  commit: z.string().nullable().optional(),
  paper: z.string().optional(),
});

export const MetaSchema = z.object({
  source: SourceSchema,
  confidence: ConfidenceSchema,
  retrievedAt: z.string(),
  notes: z.array(z.string()).default([]),
});

export const ArchitectureSchema = z.object({
  id: z.string(),
  family: z.literal("yolo"),
  version: z.string(),
  task: TaskSchema,
  inputSize: z.number().int().min(32),
  inputChannels: z.number().int().min(1).default(3),
  config: ArchConfigSchema,
  nodes: z.array(NodeSchema),
  training: TrainingSchema,
  postprocess: PostprocessSchema,
  meta: MetaSchema,
  /** Named visual groups of nodes (Lab). They do not change the exported YAML. */
  groups: z.array(z.object({ id: z.string(), name: z.string(), nodeIds: z.array(z.string()).min(1) })).default([]),
  /** Counter for fresh node ids. */
  nextId: z.number().int().min(0),
});
export type Architecture = z.infer<typeof ArchitectureSchema>;
