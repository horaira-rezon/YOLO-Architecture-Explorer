import { z } from "zod";
import { OperationSchema, type Operation } from "../schema/operation";
import type { YamlValue } from "../schema";

/**
 * The patch format the AI must return. It is deliberately flat (no unions, no recursion): block args travel as a
 * JSON-encoded string, because providers' structured-output modes reject deep or recursive schemas.
 */
export const OP_KINDS = [
  "insertNode", "deleteNode", "replaceNode", "updateArgs", "rewire", "addHeadLevel", "removeHeadLevel",
  "changeLoss", "changeAssigner", "changePostprocess", "changeScale", "changeInputSize", "changeNc", "changeHead",
] as const;

export const PatchOpSchema = z.object({
  op: z.enum(OP_KINDS),
  /** Target node id (delete/replace/updateArgs/rewire). */
  nodeId: z.string().optional(),
  /** insertNode: place after this node id. */
  after: z.string().optional(),
  /** insertNode: id to give the new node so later operations can refer to it (e.g. "ai1"). */
  newId: z.string().optional(),
  module: z.string().optional(),
  /** YAML args as a JSON array string, e.g. "[256, 3, 2]". */
  args: z.string().optional(),
  repeats: z.number().int().min(1).optional(),
  from: z.array(z.string()).optional(),
  /** insertNode: consumers of `after` that should read from the new node. */
  rewire: z.array(z.string()).optional(),
  mode: z.enum(["bridge", "dangling"]).optional(),
  level: z.enum(["P2", "P3", "P4", "P5", "P6"]).optional(),
  /** Other ops: JSON value (e.g. losses list, post-process fields, scale name, input size, nc). */
  value: z.string().optional(),
  rationaleSimple: z.string().min(1),
  rationaleForGoal: z.string().min(1),
  tradeoff: z.string().min(1),
  risk: z.string().min(1),
  confidence: z.enum(["low", "medium", "high"]),
  isHypothesis: z.boolean(),
  breaksPretrained: z.boolean(),
});
export type PatchOp = z.infer<typeof PatchOpSchema>;

export const PatchSchema = z.object({
  summary: z.string().min(1),
  assumptions: z.array(z.string()),
  suggestedExperiments: z.array(z.string()),
  operations: z.array(PatchOpSchema).max(12),
});
export type Patch = z.infer<typeof PatchSchema>;

export const NodeGoalSchema = z.object({
  nodeId: z.string(),
  role: z.string().min(1),
  contribution: z.string().min(1),
  howItWorksHere: z.string().min(1),
  whatWouldBreak: z.string().min(1),
  tradeoff: z.string().min(1),
});
export type NodeGoal = z.infer<typeof NodeGoalSchema>;
export const NodeGoalsSchema = z.object({ nodes: z.array(NodeGoalSchema) });
export type NodeGoals = z.infer<typeof NodeGoalsSchema>;

function json(s: string | undefined, what: string): unknown {
  if (s === undefined || s === "") throw new Error(`${what} is missing`);
  try {
    return JSON.parse(s) as unknown;
  } catch {
    throw new Error(`${what} is not valid JSON: ${s}`);
  }
}

/** Convert one AI patch op into a core Operation (throws with a message the model can use to repair). */
export function toOperation(p: PatchOp): Operation {
  const need = <T>(v: T | undefined, name: string): T => {
    if (v === undefined) throw new Error(`"${p.op}" needs "${name}"`);
    return v;
  };
  const args = () => {
    const a = json(p.args, "args");
    if (!Array.isArray(a)) throw new Error("args must be a JSON array");
    return a as YamlValue[];
  };
  let op: unknown;
  switch (p.op) {
    case "insertNode":
      op = { op: "insertNode", after: need(p.after, "after"), node: { module: need(p.module, "module"), args: args(), repeats: p.repeats ?? 1, id: p.newId }, from: p.from, rewire: p.rewire };
      break;
    case "deleteNode":
      op = { op: "deleteNode", nodeId: need(p.nodeId, "nodeId"), mode: p.mode ?? "bridge" };
      break;
    case "replaceNode":
      op = { op: "replaceNode", nodeId: need(p.nodeId, "nodeId"), module: need(p.module, "module"), args: args(), repeats: p.repeats };
      break;
    case "updateArgs":
      op = { op: "updateArgs", nodeId: need(p.nodeId, "nodeId"), args: p.args ? args() : undefined, repeats: p.repeats };
      break;
    case "rewire":
      op = { op: "rewire", nodeId: need(p.nodeId, "nodeId"), from: need(p.from, "from") };
      break;
    case "addHeadLevel":
      op = { op: "addHeadLevel", level: need(p.level, "level") };
      break;
    case "removeHeadLevel":
      op = { op: "removeHeadLevel", level: need(p.level, "level") };
      break;
    case "changeLoss":
      op = { op: "changeLoss", losses: json(p.value, "value") };
      break;
    case "changeAssigner":
      op = { op: "changeAssigner", assigner: String(json(p.value, "value")) };
      break;
    case "changePostprocess":
      op = { op: "changePostprocess", postprocess: json(p.value, "value") };
      break;
    case "changeScale":
      op = { op: "changeScale", scale: json(p.value, "value") };
      break;
    case "changeInputSize":
      op = { op: "changeInputSize", inputSize: json(p.value, "value") };
      break;
    case "changeNc":
      op = { op: "changeNc", nc: json(p.value, "value") };
      break;
    case "changeHead":
      op = { op: "changeHead", module: need(p.module, "module"), args: p.args ? args() : undefined };
      break;
  }
  const r = OperationSchema.safeParse(op);
  if (!r.success) throw new Error(`invalid ${p.op}: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  return r.data;
}

/** Keywords every provider's structured-output mode understands. Everything else is checked locally by Zod. */
const PORTABLE_KEYS = new Set(["type", "properties", "required", "items", "enum", "description"]);

/** Keep only portable keywords (drops min/max bounds such as Zod's 2^53 integer limit, minLength, additionalProperties…). */
export function portableSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(portableSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (!PORTABLE_KEYS.has(k)) continue;
    out[k] = k === "properties" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([p, d]) => [p, portableSchema(d)])) : portableSchema(v);
  }
  return out;
}

/** JSON Schema for providers' structured-output modes (flat and portable; Zod still validates every answer). */
export function toJsonSchema(schema: z.ZodType): unknown {
  return portableSchema(z.toJSONSchema(schema, { target: "draft-7" }));
}
