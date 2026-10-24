import { Hono } from "hono";
import { cors } from "hono/cors";
import { AIError, GeminiClient, OpenAICompatibleClient, type LLMClient } from "@yolo-atlas/core";

export interface ProxyEnv {
  GEMINI_API_KEY?: string;
  OPENAI_COMPAT_API_KEY?: string;
  OPENAI_COMPAT_BASE_URL?: string;
  PROXY_ALLOWED_ORIGINS?: string;
}

interface Body {
  provider: "gemini" | "openai-compatible";
  model: string;
  system: string;
  user: string;
  json: { name: string; schema: unknown } | null;
  temperature?: number;
}

/**
 * Minimal AI proxy: the browser sends prompts, the server adds the API key from .env.
 * Only architecture text and the user's goal are ever sent; no images or datasets.
 */
export function createApp(env: ProxyEnv, makeClient?: (b: Body) => LLMClient) {
  const app = new Hono();
  const allowed = (env.PROXY_ALLOWED_ORIGINS ?? "http://localhost:5173").split(",").map((s) => s.trim());
  app.use("/v1/*", cors({ origin: (o) => (allowed.includes(o) ? o : null), allowMethods: ["POST", "GET"] }));

  // tiny per-IP rate limit so a public proxy cannot be drained
  const hits = new Map<string, number[]>();
  const limited = (ip: string) => {
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
    recent.push(now);
    hits.set(ip, recent);
    return recent.length > 30;
  };

  app.get("/v1/health", (c) => c.json({ ok: true, providers: { gemini: !!env.GEMINI_API_KEY, "openai-compatible": !!env.OPENAI_COMPAT_API_KEY || !!env.OPENAI_COMPAT_BASE_URL } }));

  app.post("/v1/complete", async (c) => {
    const ip = c.req.header("x-forwarded-for") ?? "local";
    if (limited(ip)) return c.json({ error: "Too many requests; wait a minute." }, 429);
    let b: Body;
    try {
      b = await c.req.json<Body>();
    } catch {
      return c.json({ error: "Invalid JSON body." }, 400);
    }
    if (!b || typeof b.system !== "string" || typeof b.user !== "string" || typeof b.model !== "string") return c.json({ error: "Missing fields." }, 400);
    if (b.system.length + b.user.length > 200_000) return c.json({ error: "Prompt too large." }, 413);
    let client: LLMClient;
    if (makeClient) client = makeClient(b);
    else if (b.provider === "gemini") {
      if (!env.GEMINI_API_KEY) return c.json({ error: "GEMINI_API_KEY is not set on the proxy." }, 503);
      client = new GeminiClient(env.GEMINI_API_KEY, b.model);
    } else {
      client = new OpenAICompatibleClient(env.OPENAI_COMPAT_BASE_URL ?? "https://openrouter.ai/api/v1", env.OPENAI_COMPAT_API_KEY ?? "", b.model);
    }
    try {
      const text = await client.complete({ system: b.system, user: b.user, json: b.json ?? undefined, temperature: b.temperature });
      return c.json({ text });
    } catch (e) {
      const err = e as AIError;
      // never echo keys: messages come from the provider's error text only
      return c.json({ error: err.message }, (err.status && err.status >= 400 && err.status < 600 ? err.status : 502) as 400);
    }
  });
  return app;
}
