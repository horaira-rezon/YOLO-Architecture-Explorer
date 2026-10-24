import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Equal, Minus, Pencil, Plus } from "lucide-react";
import {
  TASKS, VERSIONS, compareSummary, computeArchitecture, diffAligned, formatCount, getBlock, getVersion,
  type Architecture, type ComputeResult, type DiffKind, type Task,
} from "@yolo-atlas/core";
import { loadArchitecture } from "../lib/modelData";
import { CONTENT } from "../lib/content";
import { useAtlas } from "../store/atlas";
import { RichText } from "../components/text/RichText";

interface Side {
  arch: Architecture;
  comp: ComputeResult;
  scale: string;
  scales: string[];
}

const KIND: Record<DiffKind, { label: string; icon: typeof Plus; cls: string }> = {
  added: { label: "new", icon: Plus, cls: "border-ok/60 bg-ok/10" },
  removed: { label: "removed", icon: Minus, cls: "border-danger/60 bg-danger/10" },
  changed: { label: "changed", icon: Pencil, cls: "border-warn/60 bg-warn/10" },
  same: { label: "same", icon: Equal, cls: "border-border" },
};

/** Compare two versions: what blocks are new, what changed, and the numbers. No AI involved. */
export function ComparePage() {
  const { task = "detect" } = useParams();
  const [params, setParams] = useSearchParams();
  const level = useAtlas((s) => s.readingLevel);
  const navigate = useNavigate();
  const supported = VERSIONS.filter((v) => v.status === "released" && v.tasks[task as Task]?.supported);
  const aId = params.get("a") ?? supported[0]?.id ?? "v8";
  const bId = params.get("b") ?? supported[Math.min(3, supported.length - 1)]?.id ?? "11";
  const [a, setA] = useState<Side | null>(null);
  const [b, setB] = useState<Side | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    Promise.all([loadArchitecture(aId, task as Task, params.get("sa") ?? undefined), loadArchitecture(bId, task as Task, params.get("sb") ?? undefined)])
      .then(([x, y]) => {
        if (!alive) return;
        setA({ arch: x.arch, comp: computeArchitecture(x.arch), scale: x.scale, scales: x.scales });
        setB({ arch: y.arch, comp: computeArchitecture(y.arch), scale: y.scale, scales: y.scales });
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [aId, bId, task, params]);

  const diff = useMemo(() => (a && b ? diffAligned(a.arch, b.arch, a.comp, b.comp) : null), [a, b]);
  const summary = useMemo(() => (a && b && diff ? compareSummary(diff, a.arch, b.arch) : null), [a, b, diff]);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    if (k === "a") next.delete("sa");
    if (k === "b") next.delete("sb");
    setParams(next);
  };
  const infoA = getVersion(aId), infoB = getVersion(bId);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <p className="text-sm text-muted"><Link to="/" className="underline">Tasks</Link> › Compare versions</p>
      <h1 className="mt-1 text-2xl font-semibold">Compare two versions</h1>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <select aria-label="Task" value={task} onChange={(e) => navigate(`/compare/${e.target.value}`)} className="rounded border border-border bg-bg px-2 py-1">
          {TASKS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <select aria-label="First version" value={aId} onChange={(e) => set("a", e.target.value)} className="rounded border border-border bg-bg px-2 py-1" data-testid="compare-a">
          {supported.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
        {a && <select aria-label="First size" value={a.scale} onChange={(e) => set("sa", e.target.value)} className="rounded border border-border bg-bg px-2 py-1">{a.scales.map((s) => <option key={s}>{s}</option>)}</select>}
        <span className="text-muted">→</span>
        <select aria-label="Second version" value={bId} onChange={(e) => set("b", e.target.value)} className="rounded border border-border bg-bg px-2 py-1" data-testid="compare-b">
          {supported.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
        {b && <select aria-label="Second size" value={b.scale} onChange={(e) => set("sb", e.target.value)} className="rounded border border-border bg-bg px-2 py-1">{b.scales.map((s) => <option key={s}>{s}</option>)}</select>}
      </div>

      {error && <p role="alert" className="mt-6 text-danger">{error}</p>}
      {!error && (!a || !b || !diff || !summary) && <p className="mt-6 text-muted" role="status">Loading both models…</p>}

      {a && b && diff && summary && (
        <>
          <section className="mt-6 grid gap-4 md:grid-cols-[2fr_1fr]" aria-label="Summary" data-testid="compare-summary">
            <div className="rounded-xl border border-border bg-surface p-4">
              <h2 className="font-semibold">What changed and why it matters</h2>
              {infoB && <p className="mt-2 text-sm"><strong>{infoB.label}:</strong> <RichText text={infoB.bigIdea[level]} /></p>}
              {summary.newBlocks.length > 0 ? (
                <ul className="mt-3 space-y-2 text-sm">
                  {summary.newBlocks.map((id) => {
                    const c = CONTENT.get(id);
                    return (
                      <li key={id} className="rounded-lg border border-ok/50 bg-ok/5 p-2">
                        <span className="flex items-center gap-1 font-semibold"><Plus size={14} aria-hidden /> New: {getBlock(id)?.displayName ?? id}</span>
                        {c && <span className="block"><RichText text={c.whatIsIt[level]} /></span>}
                        {c && <span className="block text-muted"><RichText text={c.whyExists[level]} /></span>}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="mt-3 text-sm text-muted">No new block types; the differences are in sizes, repeats or wiring.</p>}
              {summary.droppedBlocks.length > 0 && (
                <p className="mt-3 text-sm"><span className="font-semibold">No longer used:</span> {summary.droppedBlocks.map((id) => getBlock(id)?.displayName ?? id).join(", ")}</p>
              )}
            </div>
            <div className="rounded-xl border border-border bg-surface p-4 text-sm">
              <h2 className="font-semibold">Numbers (computed, 640 input)</h2>
              <table className="mt-2 w-full">
                <thead><tr className="text-left text-muted"><th></th><th>{infoA?.label} {a.scale}</th><th>{infoB?.label} {b.scale}</th></tr></thead>
                <tbody>
                  <tr><td className="text-muted">Parameters</td><td>{formatCount(a.comp.totals.params)}</td><td>{formatCount(b.comp.totals.params)}</td></tr>
                  <tr><td className="text-muted">GFLOPs</td><td>{a.comp.totals.gflops.toFixed(1)}</td><td>{b.comp.totals.gflops.toFixed(1)}</td></tr>
                  <tr><td className="text-muted">Layers</td><td>{a.comp.totals.layers}</td><td>{b.comp.totals.layers}</td></tr>
                  <tr><td className="text-muted">NMS needed</td><td>{a.arch.postprocess.nms ? "yes" : "no"}</td><td>{b.arch.postprocess.nms ? "yes" : "no"}</td></tr>
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted">{summary.counts.added} new, {summary.counts.removed} removed, {summary.counts.changed} changed, {summary.counts.same} unchanged layers. Accuracy is not compared here.</p>
              <div className="mt-3 flex gap-2">
                <Link className="rounded border border-border px-2 py-1 hover:bg-surface-2" to={`/explore/${aId}/${task}/${a.scale}`}>Open {infoA?.label}</Link>
                <Link className="rounded border border-border px-2 py-1 hover:bg-surface-2" to={`/explore/${bId}/${task}/${b.scale}`}>Open {infoB?.label}</Link>
              </div>
            </div>
          </section>

          <section className="mt-6" aria-label="Layer by layer">
            <h2 className="mb-2 font-semibold">Layer by layer</h2>
            <ul className="flex flex-wrap gap-3 text-xs" aria-label="Legend">
              {(Object.keys(KIND) as DiffKind[]).map((k) => {
                const K = KIND[k];
                return <li key={k} className={`flex items-center gap-1 rounded border px-2 py-0.5 ${K.cls}`}><K.icon size={12} aria-hidden /> {K.label}</li>;
              })}
            </ul>
            <ol className="mt-3 space-y-1 text-sm" data-testid="compare-rows">
              {diff.map((d, i) => {
                const K = KIND[d.kind];
                const cell = (n: typeof d.a, comp: ComputeResult) => n ? (
                  <span><span className="font-mono text-xs text-muted">{comp.nodes[n.id]?.index}</span> {getBlock(n.module)?.displayName ?? n.module} <span className="font-mono text-xs text-muted">{comp.nodes[n.id]?.outShape?.join("×")}</span></span>
                ) : <span className="text-muted">—</span>;
                return (
                  <li key={i} className={`grid grid-cols-[24px_1fr_1fr] items-center gap-2 rounded border px-2 py-1 ${K.cls}`}>
                    <K.icon size={14} aria-label={K.label} />
                    {cell(d.a, a.comp)}
                    <span>{cell(d.b, b.comp)}{d.changes.length > 0 && <span className="block text-xs text-muted">{d.changes.join("; ")}</span>}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
