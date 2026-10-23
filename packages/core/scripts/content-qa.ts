/**
 * Content QA (runs in CI via `pnpm content:qa`). Fails when:
 *  - a block used by any shipped model has no content file (unless listed in content/pending.json),
 *  - a content file does not match the schema (all three reading levels are required),
 *  - a section is longer than the limit for its reading level,
 *  - "Like I'm 5" text uses banned jargon,
 *  - the glossary or templates are malformed.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { BlockContentSchema, GlossarySchema, LEVELS, LeveledSchema, type BlockContent } from "../src/content/schema";
import { getBlock } from "../src/blocks/registry";
import { parseUltralyticsYaml } from "../src/compiler/yaml";
import type { ModelData } from "../src/data";

const ROOT = join(import.meta.dirname, "..");
const C = join(ROOT, "content");
const errors: string[] = [];
const warn: string[] = [];

/** Words per section. "steps" is the whole how-it-works list. */
const LIMITS = { eli5: { text: 60, steps: 80 }, simple: { text: 110, steps: 170 }, engineer: { text: 160, steps: 220 } };
const BANNED_ELI5 = [
  "tensor", "gradient", "logit", "backprop", "hyperparameter", "convolution", "kernel", "normalization", "normalisation",
  "sigmoid", "softmax", "regression", "activation", "parameter", "stride", "channel", "embedding", "matrix", "vector",
  "nonlinear", "inference", "latent", "dimension", "entropy", "IoU", "NMS", "FLOP", "quantiz",
];

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const read = (p: string) => JSON.parse(readFileSync(p, "utf8")) as unknown;

function checkContent(file: string, raw: unknown): BlockContent | null {
  const r = BlockContentSchema.safeParse(raw);
  if (!r.success) {
    errors.push(`${file}: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    return null;
  }
  const c = r.data;
  const sections = ["whatIsIt", "whyExists", "example", "typicalPositions", "tradeoffs", "costNote"] as const;
  for (const s of sections) {
    const v = c[s];
    if (!v) continue;
    for (const l of LEVELS) {
      const n = words(v[l]);
      if (n > LIMITS[l].text) errors.push(`${file}: ${s}.${l} has ${n} words (limit ${LIMITS[l].text})`);
    }
  }
  for (const l of LEVELS) {
    const n = c.howItWorks[l].reduce((a, s) => a + words(s), 0);
    if (n > LIMITS[l].steps) errors.push(`${file}: howItWorks.${l} has ${n} words (limit ${LIMITS[l].steps})`);
  }
  const eli5Text = [...sections.map((s) => c[s]?.eli5 ?? ""), ...c.howItWorks.eli5].join(" ");
  for (const b of BANNED_ELI5) {
    if (new RegExp(`\\b${b}`, "i").test(eli5Text)) errors.push(`${file}: "Like I'm 5" text uses jargon "${b}"`);
  }
  return c;
}

// ---- block + item content
const content = new Map<string, BlockContent>();
for (const dir of ["blocks", "items"]) {
  for (const f of readdirSync(join(C, dir)).filter((x) => x.endsWith(".json"))) {
    const c = checkContent(`${dir}/${f}`, read(join(C, dir, f)));
    if (c) {
      if (c.id !== f.replace(/\.json$/, "")) errors.push(`${dir}/${f}: id "${c.id}" must match the file name`);
      content.set(c.id, c);
    }
  }
}

// ---- every block used by a shipped model needs content
const pending = new Set<string>(existsSync(join(C, "pending.json")) ? (read(join(C, "pending.json")) as string[]) : []);
const used = new Set<string>();
for (const f of readdirSync(join(ROOT, "data", "models"))) {
  const data = read(join(ROOT, "data", "models", f)) as ModelData;
  for (const t of Object.values(data.tasks)) for (const v of Object.values(t?.variants ?? {})) {
    const m = parseUltralyticsYaml(v.yamlText);
    for (const row of [...m.backbone, ...m.head]) used.add(getBlock(row.module)?.id ?? row.module);
  }
}
for (const id of [...used].sort()) {
  if (content.has(id)) {
    if (pending.has(id)) errors.push(`content/pending.json still lists "${id}", which now has content; remove it`);
  } else if (pending.has(id)) warn.push(`missing content for ${id} (pending)`);
  else errors.push(`missing content/blocks/${id}.json (block used by a shipped model)`);
}

// ---- glossary
const g = GlossarySchema.safeParse(read(join(C, "glossary.json")));
if (!g.success) errors.push(`glossary.json: ${g.error.message}`);
else {
  const seen = new Set<string>();
  for (const t of g.data) {
    for (const name of [t.term, ...t.aliases]) {
      const k = name.toLowerCase();
      if (seen.has(k)) errors.push(`glossary: "${name}" appears twice`);
      seen.add(k);
    }
    const n = words(t.eli5);
    if (n > LIMITS.eli5.text) errors.push(`glossary "${t.term}": eli5 has ${n} words`);
  }
  if (g.data.length < 75) errors.push(`glossary has ${g.data.length} terms (need about 80)`);
}

// ---- templates and stages
const templates = read(join(C, "templates.json")) as Record<string, unknown>;
for (const [k, v] of Object.entries(templates)) {
  if (["objects", "consumerVerbs", "sourceKinds"].includes(k)) continue;
  if (!LeveledSchema.safeParse(v).success) errors.push(`templates.json: "${k}" needs eli5, simple and engineer`);
}
const stages = read(join(C, "stages.json")) as Record<string, { summary: unknown }>;
for (const [k, v] of Object.entries(stages)) if (!LeveledSchema.safeParse(v.summary).success) errors.push(`stages.json: "${k}" needs three levels`);

for (const w of warn) console.warn(`warn: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`\ncontent-qa: ${errors.length} problem(s)`);
  process.exit(1);
}
console.log(`content-qa: ok — ${content.size} content files, ${g.success ? g.data.length : 0} glossary terms, ${used.size} blocks in shipped models (${warn.length} pending)`);
