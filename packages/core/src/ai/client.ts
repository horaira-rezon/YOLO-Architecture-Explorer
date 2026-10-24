import { stableHash } from "../util/math";

export interface CompletionRequest {
  system: string;
  user: string;
  /** Ask for JSON matching this JSON Schema. */
  json?: { name: string; schema: unknown };
  temperature?: number;
  signal?: AbortSignal;
}

export interface LLMClient {
  readonly id: string;
  readonly model: string;
  complete(req: CompletionRequest): Promise<string>;
}

export class AIError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = false, readonly retryAfterMs?: number) {
    super(message);
  }
}

export interface KeyValueCache {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new AIError("Cancelled"));
    }, { once: true });
  });

/** Exponential backoff on 429 / 5xx (honours Retry-After), up to `retries` times. */
export async function withRetry<T>(fn: () => Promise<T>, signal?: AbortSignal, retries = 4): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw new AIError("Cancelled");
    try {
      return await fn();
    } catch (e) {
      const err = e as AIError;
      if (attempt >= retries || !(err instanceof AIError) || !err.retryable) throw e;
      const wait = err.retryAfterMs ?? Math.min(30_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 300);
      await sleep(wait, signal);
    }
  }
}

/** Runs requests one at a time so free-tier rate limits are not hit by bursts. */
export class RequestQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

/** Wraps a client with queueing, retries and a response cache keyed by a hash of the full request. */
export class ReliableClient implements LLMClient {
  private queue = new RequestQueue();
  constructor(private inner: LLMClient, private cache?: KeyValueCache) {}
  get id() {
    return this.inner.id;
  }
  get model() {
    return this.inner.model;
  }
  async complete(req: CompletionRequest): Promise<string> {
    const key = `ai:${stableHash(JSON.stringify([this.inner.id, this.inner.model, req.system, req.user, req.json?.schema ?? null, req.temperature ?? null]))}`;
    const hit = await this.cache?.get(key);
    if (hit) return hit;
    const out = await this.queue.run(() => withRetry(() => this.inner.complete(req), req.signal));
    await this.cache?.set(key, out);
    return out;
  }
}

export function statusError(status: number, body: string, retryAfter?: string | null): AIError {
  const retryable = status === 429 || status >= 500;
  const ra = retryAfter ? Number(retryAfter) * 1000 : undefined;
  const hint = status === 401 || status === 403 ? "The API key was rejected. Check it in Settings." : status === 429 ? "The provider's rate limit was reached (free tiers are small). Waiting and retrying." : "";
  return new AIError(`${hint || `The AI provider returned ${status}.`} ${body.slice(0, 300)}`.trim(), status, retryable, Number.isFinite(ra) ? ra : undefined);
}

/** Pull JSON out of a reply that may be wrapped in ``` fences or have text around it. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1]! : text;
  const start = body.search(/[[{]/);
  const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
  if (start < 0 || end < start) throw new AIError("The AI did not return JSON.");
  try {
    return JSON.parse(body.slice(start, end + 1)) as unknown;
  } catch (e) {
    throw new AIError(`The AI returned malformed JSON: ${(e as Error).message}`);
  }
}
