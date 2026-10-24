import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Bot, Loader2, Sparkles, X } from "lucide-react";
import { WEED_PRESET, applyPatchDraft, computeArchitecture, formatCount, runPatchLoop, type GoalSpec, type LoopResult } from "@yolo-atlas/core";
import { useAtlas } from "../../store/atlas";
import { applyPatch } from "../../store/lab";
import { getProvider, isMock } from "../../lib/ai";
import { describeOp } from "./describeOp";

const EMPTY: GoalSpec = { goal: "", dataset: {}, deploymentTarget: "", budget: "", alreadyTried: "" };

export function ArchitectPanel() {
  const { arch, computed, readingLevel, setAIPanelOpen, setAISession, goal: savedGoal, setGoal, setDiffView } = useAtlas();
  const [goal, setG] = useState<GoalSpec>(savedGoal ?? EMPTY);
  const [busy, setBusy] = useState<{ attempt: number } | null>(null);
  const [result, setResult] = useState<LoopResult | null>(null);
  const [base, setBase] = useState<typeof arch>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState("");
  const [applied, setApplied] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const provider = getProvider();

  const preview = useMemo(() => (result?.patch && base ? applyPatchDraft(base, result.patch, selected) : null), [result, base, selected]);
  const baseComp = useMemo(() => (base ? computeArchitecture(base) : null), [base]);

  if (!arch || !computed) return null;
  const d = goal.dataset ?? {};
  const setD = (p: Partial<NonNullable<GoalSpec["dataset"]>>) => setG({ ...goal, dataset: { ...d, ...p } });

  const generate = async (follow?: string) => {
    setError(null);
    setApplied(false);
    const ctrl = new AbortController();
    abort.current = ctrl;
    setBusy({ attempt: 1 });
    setGoal(goal);
    const start = useAtlas.getState().arch!;
    try {
      const r = await runPatchLoop(provider, {
        arch: start, comp: computeArchitecture(start), goal, level: readingLevel, tokenBudget: 24000,
        followUp: follow && result?.patch ? { request: follow, previousPatchJson: JSON.stringify(result.patch) } : undefined,
      }, { signal: ctrl.signal, onAttempt: (n) => setBusy({ attempt: n }) });
      setBase(start);
      setResult(r);
      setSelected(new Set(r.patch?.operations.map((_, i) => i).filter((i) => !r.result || r.result.ops.find((o) => o.index === i)?.ok !== false) ?? []));
    } catch (e) {
      setError(ctrl.signal.aborted ? "Cancelled." : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const apply = () => {
    if (!result?.patch || !base) return;
    if (useAtlas.getState().arch !== base) {
      setError("The model changed since this patch was made. Generate again so the patch matches the current model.");
      return;
    }
    const sessionId = `ai${Date.now().toString(36)}`;
    const r = applyPatch(sessionId, result.patch, [...selected]);
    if (r.error) return setError(r.error);
    setAISession({ id: sessionId, goal, patch: result.patch, providerLabel: provider.label, applied: [...selected], notes: r.notes });
    setDiffView(true);
    setApplied(true);
  };

  const field = "mt-0.5 w-full rounded border border-border bg-bg px-2 py-1";
  return (
    <aside className="fixed inset-x-0 bottom-0 z-30 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-border bg-surface shadow-2xl md:static md:z-auto md:max-h-none md:w-[440px] md:shrink-0 md:rounded-none md:border-l md:border-t-0 md:shadow-none" aria-label="AI Architect" data-testid="ai-panel">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface px-4 py-3">
        <Sparkles size={18} className="text-accent" aria-hidden />
        <h2 className="flex-1 text-lg font-semibold">AI Architect</h2>
        <button type="button" onClick={() => setAIPanelOpen(false)} aria-label="Close AI Architect" className="rounded p-1 hover:bg-surface-2"><X size={18} /></button>
      </header>
      <div className="space-y-3 px-4 py-3 text-sm">
        <p className="flex items-center gap-1 text-xs text-muted"><Bot size={14} aria-hidden /> Using: <strong>{provider.label}</strong> · <Link to="/settings" className="underline">change</Link></p>
        {isMock(provider) && <p className="rounded border border-warn/50 bg-warn/10 p-2 text-xs">Offline demo: suggestions come from simple keyword rules, not an AI. Connect a provider in Settings for real suggestions.</p>}

        <button type="button" onClick={() => setG(WEED_PRESET)} className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-2" data-testid="weed-preset">Preset: small weed detection on drones</button>
        <label className="block">Your goal
          <textarea value={goal.goal} onChange={(e) => setG({ ...goal, goal: e.target.value })} rows={3} className={field} placeholder="e.g. detect tiny weed seedlings in drone images, must run on a Jetson, 4 classes" data-testid="goal-input" />
        </label>
        <details>
          <summary className="cursor-pointer text-muted">Dataset and constraints (optional, text only — no data is uploaded)</summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label>Classes <input type="number" min={1} value={d.numClasses ?? ""} onChange={(e) => setD({ numClasses: e.target.value ? Number(e.target.value) : undefined })} className={field} /></label>
            <label>Object size (px) <input value={d.typicalObjectSizePx ?? ""} onChange={(e) => setD({ typicalObjectSizePx: e.target.value })} className={field} placeholder="8–32 px" /></label>
            <label>Image resolution <input value={d.imageResolution ?? ""} onChange={(e) => setD({ imageResolution: e.target.value })} className={field} /></label>
            <label>Class imbalance <input value={d.classImbalance ?? ""} onChange={(e) => setD({ classImbalance: e.target.value })} className={field} /></label>
            <label className="col-span-2">Deployment target <input value={goal.deploymentTarget ?? ""} onChange={(e) => setG({ ...goal, deploymentTarget: e.target.value })} className={field} placeholder="Jetson Orin Nano, CPU, phone…" /></label>
            <label className="col-span-2">Budget <input value={goal.budget ?? ""} onChange={(e) => setG({ ...goal, budget: e.target.value })} className={field} placeholder="under 5 M parameters, 30 FPS…" /></label>
            <label className="col-span-2">Already tried <input value={goal.alreadyTried ?? ""} onChange={(e) => setG({ ...goal, alreadyTried: e.target.value })} className={field} /></label>
          </div>
        </details>
        <div className="flex gap-2">
          <button type="button" disabled={!goal.goal.trim() || !!busy} onClick={() => void generate()} className="flex items-center gap-1 rounded bg-accent px-3 py-1.5 text-accent-fg disabled:opacity-40" data-testid="generate">
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />} Generate
          </button>
          {busy && <button type="button" onClick={() => abort.current?.abort()} className="rounded border border-border px-3 py-1.5">Cancel</button>}
        </div>
        {busy && <p role="status" className="text-muted">Asking {provider.label}… {busy.attempt > 1 ? `fixing problems (attempt ${busy.attempt} of 4)` : "this can take a few seconds"}</p>}
        {error && <p role="alert" className="text-danger">{error}</p>}

        {result?.patch && base && preview && (
          <div className="space-y-3 border-t border-border pt-3" data-testid="patch-preview">
            <p className="font-semibold">{result.patch.summary}</p>
            {!result.ok && (
              <div role="alert" className="rounded border border-warn/60 bg-warn/10 p-2 text-xs">
                <p className="flex items-center gap-1 font-semibold"><AlertTriangle size={13} /> After {result.attempts} attempts some problems remain. You can apply the parts that work and fix the rest by hand:</p>
                <ul className="list-disc pl-4">{result.problems.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            )}
            {result.patch.assumptions.length > 0 && <details><summary className="cursor-pointer text-muted">Assumptions ({result.patch.assumptions.length})</summary><ul className="list-disc pl-5">{result.patch.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></details>}
            <ol className="space-y-2">
              {result.patch.operations.map((op, i) => {
                const st = preview.ops.find((o) => o.index === i);
                return (
                  <li key={i} className={`rounded-lg border p-2 ${selected.has(i) ? "border-accent" : "border-border opacity-70"}`} data-testid={`patch-op-${i}`}>
                    <label className="flex items-start gap-2">
                      <input type="checkbox" checked={selected.has(i)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(i); else n.delete(i); return n; })} className="mt-1" aria-label={`Accept change ${i + 1}`} />
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold">{i + 1}. {describeOp(op, base, baseComp)}</span>
                        <span className="ml-1 rounded bg-warn/15 px-1 text-[10px] font-semibold uppercase text-warn">hypothesis</span>
                        <span className="ml-1 rounded bg-surface-2 px-1 text-[10px] uppercase text-muted">confidence {op.confidence}</span>
                        <span className="mt-1 block">{op.rationaleSimple}</span>
                        <span className="mt-1 block"><strong>For your goal:</strong> {op.rationaleForGoal}</span>
                        <span className="mt-1 block text-muted"><strong>Trade-off:</strong> {op.tradeoff} <strong>Risk:</strong> {op.risk}</span>
                        {op.breaksPretrained && <span className="mt-1 block text-xs text-warn">Pretrained weights will not load for the changed layers.</span>}
                        {st && !st.ok && <span className="mt-1 block text-xs text-danger">Cannot be applied: {st.error}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ol>
            <div className="rounded-lg bg-surface-2 p-2 text-xs" aria-live="polite">
              With the selected changes: {formatCount(preview.comp.totals.params)} params ({formatCount(baseComp?.totals.params ?? 0)} before), {preview.comp.totals.gflops.toFixed(1)} GFLOPs ({baseComp?.totals.gflops.toFixed(1)} before).
              {preview.errors.length > 0 ? <span className="block text-danger">Problems: {preview.errors.join(" · ")}</span> : <span className="block text-ok">The resulting model is valid.</span>}
            </div>
            <button type="button" disabled={!selected.size || applied} onClick={apply} className="w-full rounded bg-accent px-3 py-2 text-accent-fg disabled:opacity-40" data-testid="apply-patch">
              {applied ? "Applied (undo with Ctrl+Z)" : `Apply ${selected.size} selected change${selected.size === 1 ? "" : "s"}`}
            </button>
            {result.patch.suggestedExperiments.length > 0 && (
              <div>
                <p className="font-semibold">Suggested experiments (ablation order)</p>
                <ol className="list-decimal pl-5">{result.patch.suggestedExperiments.map((x) => <li key={x}>{x}</li>)}</ol>
              </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); if (followUp.trim()) void generate(followUp.trim()); }} className="flex gap-1">
              <input value={followUp} onChange={(e) => setFollowUp(e.target.value)} placeholder='Refine: "make it lighter", "keep P5", "why not attention at P3?"' className="flex-1 rounded border border-border bg-bg px-2 py-1" aria-label="Refine the suggestion" />
              <button type="submit" disabled={!!busy || !followUp.trim()} className="rounded border border-border px-2 disabled:opacity-40">Refine</button>
            </form>
          </div>
        )}
      </div>
    </aside>
  );
}
