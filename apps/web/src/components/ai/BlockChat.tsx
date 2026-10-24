import { useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Loader2 } from "lucide-react";
import { useAtlas } from "../../store/atlas";
import { getProvider, isMock } from "../../lib/ai";

/** Small chat about one block: sends only a text description of the block and the question. */
export function BlockChat({ context }: { context: string }) {
  const level = useAtlas((s) => s.readingLevel);
  const goal = useAtlas((s) => s.goal?.goal ?? s.aiSession?.goal.goal);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ q: string; a: string; error?: boolean }[]>([]);
  const provider = getProvider();
  const ask = async () => {
    const question = q.trim();
    if (!question) return;
    setBusy(true);
    setQ("");
    try {
      const a = await provider.chat({ question, blockContext: context, goal, level });
      setLog((l) => [...l, { q: question, a }]);
    } catch (e) {
      setLog((l) => [...l, { q: question, a: e instanceof Error ? e.message : String(e), error: true }]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2" data-testid="block-chat">
      {isMock(provider) && (
        <p className="flex items-start gap-2 text-muted"><Bot size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>No AI is connected (offline demo). Connect a provider in <Link to="/settings" className="text-accent underline">Settings</Link> to get real answers.</span></p>
      )}
      {log.map((m, i) => (
        <div key={i} className="rounded-lg border border-border p-2">
          <p className="font-semibold">{m.q}</p>
          <p className={m.error ? "text-danger" : ""}>{m.a}</p>
          {!m.error && <p className="mt-1 text-[10px] font-semibold uppercase text-warn">AI-generated · not verified</p>}
        </div>
      ))}
      <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about this block…" aria-label="Question about this block" className="flex-1 rounded border border-border bg-bg px-2 py-1" />
        <button type="submit" disabled={busy || !q.trim()} className="flex items-center gap-1 rounded bg-accent px-2 text-accent-fg disabled:opacity-40">{busy && <Loader2 size={12} className="animate-spin" />}Ask</button>
      </form>
      <p className="text-[11px] text-muted">Only the block's description and your question are sent to {provider.label}.</p>
    </div>
  );
}
