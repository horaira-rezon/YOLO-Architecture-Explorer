import type { Level } from "../content/schema";
import { extractJson, type LLMClient } from "./client";
import { buildExplainUser, buildPatchUser, type ExplainContext, type PatchContext } from "./context";
import { NodeGoalsSchema, PatchSchema, toJsonSchema, type NodeGoals } from "./schema";
import { PATCH_SYSTEM } from "./prompts/patch.v1";
import { EXPLAIN_SYSTEM } from "./prompts/explain.v1";
import { CHAT_SYSTEM } from "./prompts/chat.v1";

export interface ChatInput {
  question: string;
  /** Plain-text description of the block, its position, shapes and neighbours. */
  blockContext: string;
  goal?: string;
  level: Level;
  signal?: AbortSignal;
}

/** Everything the app asks an AI for. Raw JSON from generatePatch is validated by the patch loop. */
export interface AIProvider {
  readonly id: string;
  readonly label: string;
  generatePatch(ctx: PatchContext, signal?: AbortSignal): Promise<unknown>;
  explainNodes(ctx: ExplainContext, signal?: AbortSignal): Promise<NodeGoals>;
  chat(input: ChatInput): Promise<string>;
}

const patchSchema = toJsonSchema(PatchSchema);
const goalsSchema = toJsonSchema(NodeGoalsSchema);

/** Provider backed by any LLM client (Gemini, OpenAI-compatible, Anthropic, proxy). */
export class LLMProvider implements AIProvider {
  constructor(private client: LLMClient, readonly label: string) {}
  get id() {
    return `${this.client.id}:${this.client.model}`;
  }
  async generatePatch(ctx: PatchContext, signal?: AbortSignal): Promise<unknown> {
    const text = await this.client.complete({ system: PATCH_SYSTEM, user: buildPatchUser(ctx), json: { name: "patch", schema: patchSchema }, temperature: ctx.repair ? 0.2 : 0.4, signal });
    return extractJson(text);
  }
  async explainNodes(ctx: ExplainContext, signal?: AbortSignal): Promise<NodeGoals> {
    const text = await this.client.complete({ system: EXPLAIN_SYSTEM, user: buildExplainUser(ctx), json: { name: "explanations", schema: goalsSchema }, temperature: 0.3, signal });
    return NodeGoalsSchema.parse(extractJson(text));
  }
  async chat(input: ChatInput): Promise<string> {
    return this.client.complete({
      system: CHAT_SYSTEM,
      user: `${input.blockContext}\n${input.goal ? `Learner's goal: ${input.goal}\n` : ""}Reading level: ${input.level}\nQuestion: ${input.question}`,
      temperature: 0.4,
      signal: input.signal,
    });
  }
}
