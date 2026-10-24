import {
  AnthropicClient, GeminiClient, LLMProvider, MockProvider, OpenAICompatibleClient, ProxyClient, ReliableClient,
  type AIProvider, type KeyValueCache,
} from "@yolo-atlas/core";
import { persist } from "./persist";

export type ProviderKind = "mock" | "gemini" | "openai" | "anthropic" | "proxy";

export interface AISettings {
  provider: ProviderKind;
  geminiModel: string;
  geminiKey: string;
  openaiBaseUrl: string;
  openaiKey: string;
  openaiModel: string;
  anthropicKey: string;
  anthropicModel: string;
  proxyUrl: string;
  proxyProvider: "gemini" | "openai-compatible";
  proxyModel: string;
}

/** Model ids checked against https://ai.google.dev/gemini-api/docs/models on 2026-10-24. */
export const GEMINI_MODELS: { id: string; note: string }[] = [
  { id: "gemini-3.5-flash-lite", note: "fastest and cheapest; free tier (default)" },
  { id: "gemini-3.8-flash", note: "stronger reasoning; free tier" },
  { id: "gemini-3.6-flash", note: "free tier" },
  { id: "gemini-3.1-flash-lite", note: "free tier" },
  { id: "gemini-2.5-flash", note: "legacy, still served" },
];

const DEFAULTS: AISettings = {
  provider: "mock",
  geminiModel: "gemini-3.5-flash-lite",
  geminiKey: "",
  openaiBaseUrl: "https://openrouter.ai/api/v1",
  openaiKey: "",
  openaiModel: "",
  anthropicKey: "",
  anthropicModel: "claude-haiku-5-5",
  proxyUrl: "http://localhost:8787",
  proxyProvider: "gemini",
  proxyModel: "gemini-3.5-flash-lite",
};

const KEY = "atlas-ai-settings";

export function loadAISettings(): AISettings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<AISettings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveAISettings(s: AISettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage blocked: settings last for this visit only
  }
  current = null;
}

export function clearAIKeys(): void {
  saveAISettings({ ...loadAISettings(), geminiKey: "", openaiKey: "", anthropicKey: "" });
}

const cache: KeyValueCache = {
  get: (k) => persist.get<string>(k),
  set: async (k, v) => void (await persist.set(k, v)),
};

let current: { key: string; provider: AIProvider } | null = null;

/** The provider chosen in Settings (MockProvider when nothing is configured). */
export function getProvider(): AIProvider {
  const s = loadAISettings();
  const key = JSON.stringify(s);
  if (current?.key === key) return current.provider;
  let provider: AIProvider;
  switch (s.provider) {
    case "gemini":
      provider = s.geminiKey ? new LLMProvider(new ReliableClient(new GeminiClient(s.geminiKey, s.geminiModel), cache), `Gemini (${s.geminiModel})`) : new MockProvider();
      break;
    case "openai":
      provider = new LLMProvider(new ReliableClient(new OpenAICompatibleClient(s.openaiBaseUrl, s.openaiKey, s.openaiModel), cache), `OpenAI-compatible (${s.openaiModel})`);
      break;
    case "anthropic":
      provider = s.anthropicKey ? new LLMProvider(new ReliableClient(new AnthropicClient(s.anthropicKey, s.anthropicModel), cache), `Anthropic (${s.anthropicModel}, experimental)`) : new MockProvider();
      break;
    case "proxy":
      provider = new LLMProvider(new ReliableClient(new ProxyClient(s.proxyUrl, s.proxyProvider, s.proxyModel), cache), `Proxy (${s.proxyModel})`);
      break;
    default:
      provider = new MockProvider();
  }
  current = { key, provider };
  return provider;
}

export const isMock = (p: AIProvider) => p.id === "mock";
