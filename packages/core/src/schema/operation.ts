import { z } from "zod";
import { LossItemSchema, PostprocessSchema, StageSchema, YamlValueSchema } from "./architecture";

export const NewNodeSchema = z.object({
  module: z.string().min(1),
  args: z.array(YamlValueSchema),
  repeats: z.number().int().min(1).default(1),
  stage: StageSchema.optional(),
  /** Optional id to use (lets patches refer to nodes they add). Must be unused. */
  id: z.string().optional(),
});
export type NewNode = z.infer<typeof NewNodeSchema>;

export const OperationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("insertNode"),
    node: NewNodeSchema,
    /** The new node is placed right after this node in layer order. */
    after: z.string(),
    /** Inputs of the new node. Default: [after]. */
    from: z.array(z.string()).optional(),
    /** Nodes that read from `after` and should read from the new node instead. Default: all of them. */
    rewire: z.array(z.string()).optional(),
  }),
  z.object({ op: z.literal("deleteNode"), nodeId: z.string(), mode: z.enum(["bridge", "dangling"]).default("bridge") }),
  z.object({ op: z.literal("replaceNode"), nodeId: z.string(), module: z.string(), args: z.array(YamlValueSchema), repeats: z.number().int().min(1).optional() }),
  z.object({ op: z.literal("updateArgs"), nodeId: z.string(), args: z.array(YamlValueSchema).optional(), repeats: z.number().int().min(1).optional() }),
  z.object({ op: z.literal("rewire"), nodeId: z.string(), from: z.array(z.string()) }),
  z.object({ op: z.literal("moveNode"), nodeId: z.string(), after: z.string() }),
  z.object({ op: z.literal("duplicateNodes"), nodeIds: z.array(z.string()).min(1) }),
  z.object({
    op: z.literal("pasteNodes"),
    nodes: z.array(z.object({ id: z.string(), module: z.string(), args: z.array(YamlValueSchema), repeats: z.number().int().min(1), from: z.array(z.string()), stage: StageSchema })),
    after: z.string(),
  }),
  z.object({ op: z.literal("addHeadLevel"), level: z.enum(["P2", "P6"]) }),
  z.object({ op: z.literal("removeHeadLevel"), level: z.enum(["P3", "P4", "P5", "P6", "P2"]) }),
  z.object({ op: z.literal("changeLoss"), losses: z.array(LossItemSchema) }),
  z.object({ op: z.literal("changeAssigner"), assigner: z.string() }),
  z.object({ op: z.literal("changePostprocess"), postprocess: PostprocessSchema.partial() }),
  z.object({ op: z.literal("changeScale"), scale: z.string().nullable(), depthMultiple: z.number().optional(), widthMultiple: z.number().optional(), maxChannels: z.number().nullable().optional() }),
  z.object({ op: z.literal("changeInputSize"), inputSize: z.number().int().min(32).max(4096) }),
  z.object({ op: z.literal("changeNc"), nc: z.number().int().min(1).max(100000) }),
  z.object({ op: z.literal("groupNodes"), nodeIds: z.array(z.string()).min(1), name: z.string().min(1) }),
  z.object({ op: z.literal("ungroup"), groupId: z.string() }),
  z.object({ op: z.literal("changeHead"), module: z.string(), args: z.array(YamlValueSchema).optional() }),
]);
export type Operation = z.infer<typeof OperationSchema>;
export type OperationType = Operation["op"];
