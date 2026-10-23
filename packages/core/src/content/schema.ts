import { z } from "zod";

export const LEVELS = ["eli5", "simple", "engineer"] as const;
export type Level = (typeof LEVELS)[number];

export const LeveledSchema = z.object({ eli5: z.string().min(1), simple: z.string().min(1), engineer: z.string().min(1) });
export type Leveled = z.infer<typeof LeveledSchema>;

export const LeveledStepsSchema = z.object({
  eli5: z.array(z.string().min(1)).min(1),
  simple: z.array(z.string().min(1)).min(1),
  engineer: z.array(z.string().min(1)).min(1),
});
export type LeveledSteps = z.infer<typeof LeveledStepsSchema>;

export const RefSchema = z.object({ label: z.string(), url: z.string().url() });

/** Authored once per block type (or per non-layer item such as a loss or NMS). */
export const BlockContentSchema = z.object({
  id: z.string(),
  name: z.string(),
  whatIsIt: LeveledSchema,
  whyExists: LeveledSchema,
  howItWorks: LeveledStepsSchema,
  /** Tiny worked example with real numbers. */
  example: LeveledSchema.optional(),
  analogy: z.string().optional(),
  typicalPositions: LeveledSchema.optional(),
  tradeoffs: LeveledSchema.optional(),
  /** KaTeX source shown at the engineer level. */
  math: z.array(z.string()).optional(),
  pytorch: z.string().optional(),
  references: z.array(RefSchema).optional(),
  /** For Lab extras: what problem it solves and what it costs. */
  costNote: LeveledSchema.optional(),
});
export type BlockContent = z.infer<typeof BlockContentSchema>;

export const GlossaryTermSchema = z.object({
  term: z.string(),
  aliases: z.array(z.string()).default([]),
  eli5: z.string(),
  simple: z.string(),
  engineer: z.string(),
});
export type GlossaryTerm = z.infer<typeof GlossaryTermSchema>;
export const GlossarySchema = z.array(GlossaryTermSchema);

/** Per-version notes for important layers, keyed by "<task>:<index>" or "*:<index>". */
export const AnnotationsSchema = z.record(z.string(), LeveledSchema);
