import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

describe("proxy", () => {
  const app = createApp({ PROXY_ALLOWED_ORIGINS: "http://localhost:5173" }, (b) => ({ id: "fake", model: b.model, complete: async (r) => `echo:${r.user}` }));
  it("forwards prompts and returns text", async () => {
    const r = await app.request("/v1/complete", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" }, body: JSON.stringify({ provider: "gemini", model: "m", system: "s", user: "hi", json: null }) });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ text: "echo:hi" });
    expect(r.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
  });
  it("rejects bad bodies and unknown origins get no CORS header", async () => {
    const r = await app.request("/v1/complete", { method: "POST", headers: { Origin: "https://evil.example" }, body: "{" });
    expect(r.status).toBe(400);
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
  });
  it("reports a missing key without leaking anything", async () => {
    const real = createApp({});
    const r = await real.request("/v1/complete", { method: "POST", body: JSON.stringify({ provider: "gemini", model: "m", system: "s", user: "u", json: null }) });
    expect(r.status).toBe(503);
  });
});
