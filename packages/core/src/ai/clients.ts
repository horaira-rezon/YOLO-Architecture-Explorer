import { AIError, statusError, type CompletionRequest, type LLMClient } from "./client";

/** Google Gemini via the official @google/genai SDK (loaded only when used). */
export class GeminiClient implements LLMClient {
  readonly id = "gemini";
  constructor(private apiKey: string, readonly model: string) {}
  async complete(req: CompletionRequest): Promise<string> {
    const { GoogleGenAI, ApiError } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    try {
      const res = await ai.models.generateContent({
        model: this.model,
        contents: req.user,
        config: {
          systemInstruction: req.system,
          temperature: req.temperature ?? 0.4,
          abortSignal: req.signal,
          ...(req.json ? { responseMimeType: "application/json", responseJsonSchema: req.json.schema } : {}),
        },
      });
      const text = res.text;
      if (!text) throw new AIError("Gemini returned an empty answer (it may have been blocked by a safety filter).");
      return text;
    } catch (e) {
      if (req.signal?.aborted) throw new AIError("Cancelled");
      if (e instanceof ApiError) throw statusError(e.status, e.message);
      throw e;
    }
  }
}

/** OpenAI-compatible chat completions (OpenRouter, Groq, local Ollama…). */
export class OpenAICompatibleClient implements LLMClient {
  readonly id = "openai-compatible";
  private jsonSchemaUnsupported = false;
  constructor(private baseUrl: string, private apiKey: string, readonly model: string) {}
  async complete(req: CompletionRequest): Promise<string> {
    const body = (format: "schema" | "object" | "none") => ({
      model: this.model,
      temperature: req.temperature ?? 0.4,
      messages: [{ role: "system", content: req.system + (req.json && format !== "schema" ? `\nReturn only JSON matching this JSON Schema: ${JSON.stringify(req.json.schema)}` : "") }, { role: "user", content: req.user }],
      ...(req.json && format === "schema" ? { response_format: { type: "json_schema", json_schema: { name: req.json.name, schema: req.json.schema, strict: false } } } : {}),
      ...(req.json && format === "object" ? { response_format: { type: "json_object" } } : {}),
    });
    const send = async (format: "schema" | "object" | "none") => {
      const r = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        signal: req.signal,
        headers: { "Content-Type": "application/json", ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
        body: JSON.stringify(body(format)),
      });
      return r;
    };
    let r = await send(req.json && !this.jsonSchemaUnsupported ? "schema" : req.json ? "object" : "none");
    if (r.status === 400 && req.json && !this.jsonSchemaUnsupported) {
      // some servers (older Ollama / Groq models) reject json_schema: fall back to plain JSON mode
      this.jsonSchemaUnsupported = true;
      r = await send("object");
    }
    if (!r.ok) throw statusError(r.status, await r.text(), r.headers.get("retry-after"));
    const data = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new AIError("The provider returned an empty answer.");
    return text;
  }
}

/**
 * Anthropic Messages API (experimental stub: plain JSON instructions, no tool-based structured output).
 * Browser calls need the "dangerous direct browser access" header; prefer the proxy for real use.
 */
export class AnthropicClient implements LLMClient {
  readonly id = "anthropic";
  constructor(private apiKey: string, readonly model: string) {}
  async complete(req: CompletionRequest): Promise<string> {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: req.signal,
      headers: { "content-type": "application/json", "x-api-key": this.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 8000,
        system: req.system + (req.json ? `\nReturn only JSON matching this JSON Schema: ${JSON.stringify(req.json.schema)}` : ""),
        messages: [{ role: "user", content: req.user }],
      }),
    });
    if (!r.ok) throw statusError(r.status, await r.text(), r.headers.get("retry-after"));
    const data = (await r.json()) as { content?: { type: string; text?: string }[] };
    return (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("");
  }
}

/** The optional apps/proxy server keeps provider keys out of the browser. */
export class ProxyClient implements LLMClient {
  readonly id = "proxy";
  constructor(private url: string, private provider: "gemini" | "openai-compatible", readonly model: string) {}
  async complete(req: CompletionRequest): Promise<string> {
    const r = await fetch(`${this.url.replace(/\/$/, "")}/v1/complete`, {
      method: "POST",
      signal: req.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: this.provider, model: this.model, system: req.system, user: req.user, json: req.json ?? null, temperature: req.temperature }),
    });
    if (!r.ok) throw statusError(r.status, await r.text(), r.headers.get("retry-after"));
    const data = (await r.json()) as { text?: string };
    if (!data.text) throw new AIError("The proxy returned an empty answer.");
    return data.text;
  }
}
