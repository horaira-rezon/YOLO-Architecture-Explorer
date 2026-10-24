import { useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { GEMINI_MODELS, clearAIKeys, getProvider, loadAISettings, saveAISettings, type AISettings, type ProviderKind } from "../lib/ai";
import { useAtlas } from "../store/atlas";
import { ReadingLevelSwitch } from "../components/ReadingLevelSwitch";
import { persist } from "../lib/persist";
import { resetTour } from "../components/Tour";

const PROVIDERS: { id: ProviderKind; label: string; hint: string }[] = [
  { id: "mock", label: "Offline demo (no AI)", hint: "Rule-based example patches. Nothing leaves your browser." },
  { id: "gemini", label: "Google Gemini (your key)", hint: "Free tier available. Key stays in this browser." },
  { id: "openai", label: "OpenAI-compatible", hint: "OpenRouter, Groq, or a local Ollama server." },
  { id: "proxy", label: "Your own proxy", hint: "apps/proxy keeps keys on a server (.env)." },
  { id: "anthropic", label: "Anthropic (experimental)", hint: "Basic support; prefer the proxy." },
];

export function SettingsPage() {
  const [s, setS] = useState<AISettings>(() => loadAISettings());
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; msg: string } | null>(null);
  const autoZoom = useAtlas((x) => x.autoZoom);
  const setAutoZoom = useAtlas((x) => x.setAutoZoom);
  const up = (p: Partial<AISettings>) => {
    setS((x) => ({ ...x, ...p }));
    setSaved(false);
  };
  const save = () => {
    saveAISettings(s);
    setSaved(true);
  };
  const runTest = async () => {
    save();
    setTest(null);
    try {
      const reply = await getProvider().chat({ question: "Reply with the single word OK.", blockContext: "Connection test.", level: "simple" });
      setTest({ ok: true, msg: `Connected. Reply: ${reply.slice(0, 120)}` });
    } catch (e) {
      setTest({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    }
  };
  const input = "mt-0.5 w-full rounded border border-border bg-bg px-2 py-1";
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="mt-6 space-y-2" aria-labelledby="s-read">
        <h2 id="s-read" className="font-semibold">Reading</h2>
        <div className="flex items-center gap-3 text-sm">Default reading level <ReadingLevelSwitch /></div>
        <button type="button" className="rounded border border-border px-2 py-1 text-sm" onClick={() => { resetTour(); window.alert("The tour will show next time you open a model."); }}>Show the guided tour again</button>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoZoom} onChange={(e) => setAutoZoom(e.target.checked)} /> Change zoom level automatically when zooming the diagram far in or out</label>
      </section>

      <section className="mt-8 space-y-3" aria-labelledby="s-ai">
        <h2 id="s-ai" className="font-semibold">AI provider</h2>
        <div className="rounded-lg border border-warn/50 bg-warn/10 p-3 text-sm" role="note">
          <p className="flex items-center gap-1 font-semibold"><ShieldAlert size={16} aria-hidden /> What is sent, and to whom</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Only a text description of the architecture, your goal and the questions you type. Images and datasets are never uploaded.</li>
            <li>With Google's <strong>free tier</strong>, Google's pricing page says content may be used to improve their products; on the paid tier it is not. Check the provider's current terms before sending anything private.</li>
            <li>Free tiers have small, per-project rate limits; the app waits and retries automatically, one request at a time.</li>
            <li>Keys you enter are stored only in this browser's local storage, readable by any code on this page. On shared computers, use the proxy instead or clear keys after use.</li>
          </ul>
        </div>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Provider">
          {PROVIDERS.map((p) => (
            <label key={p.id} className={`cursor-pointer rounded-lg border p-3 text-sm ${s.provider === p.id ? "border-accent bg-accent/5" : "border-border"}`}>
              <input type="radio" name="provider" className="mr-2" checked={s.provider === p.id} onChange={() => up({ provider: p.id })} />
              <strong>{p.label}</strong>
              <span className="block text-muted">{p.hint}</span>
            </label>
          ))}
        </div>

        {s.provider === "gemini" && (
          <div className="space-y-2 text-sm">
            <label className="block">Model
              <select className={input} value={s.geminiModel} onChange={(e) => up({ geminiModel: e.target.value })}>
                {GEMINI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.id} — {m.note}</option>)}
              </select>
            </label>
            <label className="block">API key (from Google AI Studio)
              <input type="password" autoComplete="off" className={input} value={s.geminiKey} onChange={(e) => up({ geminiKey: e.target.value })} placeholder="paste your key" />
            </label>
            <p className="text-xs text-muted">Model list checked against Google's docs on 2026-10-24; names change, so check <a className="underline" href="https://ai.google.dev/gemini-api/docs/models" target="_blank" rel="noreferrer">the models page</a> and <a className="underline" href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer">pricing</a>.</p>
          </div>
        )}
        {s.provider === "openai" && (
          <div className="space-y-2 text-sm">
            <label className="block">Base URL <input className={input} value={s.openaiBaseUrl} onChange={(e) => up({ openaiBaseUrl: e.target.value })} /></label>
            <p className="text-xs text-muted">OpenRouter: https://openrouter.ai/api/v1 · Groq: https://api.groq.com/openai/v1 · Ollama: http://localhost:11434/v1</p>
            <label className="block">Model <input className={input} value={s.openaiModel} onChange={(e) => up({ openaiModel: e.target.value })} placeholder="model id as the server names it" /></label>
            <label className="block">API key (empty for local servers) <input type="password" autoComplete="off" className={input} value={s.openaiKey} onChange={(e) => up({ openaiKey: e.target.value })} /></label>
          </div>
        )}
        {s.provider === "anthropic" && (
          <div className="space-y-2 text-sm">
            <label className="block">Model <input className={input} value={s.anthropicModel} onChange={(e) => up({ anthropicModel: e.target.value })} /></label>
            <label className="block">API key <input type="password" autoComplete="off" className={input} value={s.anthropicKey} onChange={(e) => up({ anthropicKey: e.target.value })} /></label>
          </div>
        )}
        {s.provider === "proxy" && (
          <div className="space-y-2 text-sm">
            <label className="block">Proxy URL <input className={input} value={s.proxyUrl} onChange={(e) => up({ proxyUrl: e.target.value })} /></label>
            <label className="block">Provider on the proxy
              <select className={input} value={s.proxyProvider} onChange={(e) => up({ proxyProvider: e.target.value as AISettings["proxyProvider"] })}><option value="gemini">gemini</option><option value="openai-compatible">openai-compatible</option></select>
            </label>
            <label className="block">Model <input className={input} value={s.proxyModel} onChange={(e) => up({ proxyModel: e.target.value })} /></label>
            <p className="text-xs text-muted">Start it with <code>pnpm --filter @yolo-atlas/proxy start</code> after filling <code>.env</code> (see <code>.env.example</code>).</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={save} className="rounded bg-accent px-3 py-1.5 text-sm text-accent-fg" data-testid="save-ai">Save</button>
          <button type="button" onClick={() => void runTest()} className="rounded border border-border px-3 py-1.5 text-sm">Test connection</button>
          <button type="button" onClick={() => { clearAIKeys(); setS(loadAISettings()); }} className="rounded border border-border px-3 py-1.5 text-sm">Forget my keys</button>
          {saved && <span className="flex items-center gap-1 text-sm text-ok"><CheckCircle2 size={14} /> Saved</span>}
        </div>
        {test && <p role="status" className={`flex items-start gap-1 text-sm ${test.ok ? "text-ok" : "text-danger"}`}>{test.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} {test.msg}</p>}
      </section>

      <section className="mt-8" aria-labelledby="s-data">
        <h2 id="s-data" className="font-semibold">Data stored in this browser</h2>
        <p className="mt-1 text-sm text-muted">Lab autosaves, snapshots, templates and cached AI answers live in IndexedDB on this device only.</p>
        <button type="button" className="mt-2 rounded border border-danger/60 px-3 py-1.5 text-sm text-danger" onClick={async () => { if (window.confirm("Delete all saved Lab work, snapshots, templates and cached AI answers in this browser?")) { for (const k of await persist.keys()) await persist.del(k); } }}>Delete all local data</button>
      </section>
    </div>
  );
}
