import { computeArchitecture, formatCount } from "@yolo-atlas/core";
import { useMemo } from "react";
import { useAtlas } from "../../store/atlas";
import { useExplainAll } from "../../lib/goalContext";
import { describeOp } from "./describeOp";

/** The whole modification as a story: problem → each change → expected effect → trade-offs → ablation order. */
export function ChangeStory() {
  const { aiSession, original, arch, computed, goal } = useAtlas();
  const job = useExplainAll();
  const origComp = useMemo(() => (original ? computeArchitecture(original) : null), [original]);
  if (!aiSession?.applied || !original || !origComp || !arch || !computed) {
    return <p className="text-sm text-muted">Apply an AI patch to see its story here.</p>;
  }
  const ops = aiSession.applied.map((i) => ({ i, op: aiSession.patch.operations[i]! }));
  const g = aiSession.goal;
  return (
    <article className="space-y-3 text-sm" data-testid="change-story">
      <section>
        <h3 className="font-semibold">1. The problem</h3>
        <p>{g.goal}</p>
        {g.dataset?.typicalObjectSizePx && <p className="text-muted">Objects are about {g.dataset.typicalObjectSizePx}.</p>}
        {g.deploymentTarget && <p className="text-muted">It must run on: {g.deploymentTarget}.</p>}
      </section>
      <section>
        <h3 className="font-semibold">2. The changes, in order</h3>
        <ol className="space-y-2">
          {ops.map(({ i, op }, k) => (
            <li key={i} className="rounded-lg border border-border p-2">
              <p className="font-semibold">{k + 1}. {describeOp(op, original, origComp)}</p>
              <p>{op.rationaleSimple}</p>
              <p><strong>Expected effect:</strong> {op.rationaleForGoal}</p>
              <p className="text-muted"><strong>Trade-off:</strong> {op.tradeoff} <strong>Risk:</strong> {op.risk}</p>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h3 className="font-semibold">3. What it costs</h3>
        <p>Parameters {formatCount(origComp.totals.params)} → {formatCount(computed.totals.params)}; GFLOPs {origComp.totals.gflops.toFixed(1)} → {computed.totals.gflops.toFixed(1)} at {arch.inputSize}×{arch.inputSize}. Speed and accuracy must be measured.</p>
        {ops.some((o) => o.op.breaksPretrained) && <p className="text-warn">Some changed layers will not get pretrained weights; plan for a longer training.</p>}
      </section>
      <section>
        <h3 className="font-semibold">4. How to test it (one change at a time)</h3>
        <ol className="list-decimal pl-5">{aiSession.patch.suggestedExperiments.map((x) => <li key={x}>{x}</li>)}</ol>
      </section>
      <p className="text-xs text-muted">Every change is a hypothesis from {aiSession.providerLabel}; nothing here is measured.</p>
      {goal && (
        <div className="rounded-lg border border-border p-2" data-testid="explain-all">
          <p className="font-semibold">Explain every block for this goal</p>
          {job.running ? (
            <>
              <div className="mt-1 h-2 w-full overflow-hidden rounded bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={job.total} aria-valuenow={job.done}>
                <div className="h-full bg-accent" style={{ width: `${job.total ? (100 * job.done) / job.total : 5}%` }} />
              </div>
              <p className="mt-1 text-xs">{job.done} of {job.total} layers… <button type="button" onClick={job.cancel} className="underline">cancel</button></p>
            </>
          ) : (
            <button type="button" onClick={() => void job.start()} className="mt-1 rounded border border-border px-2 py-1 text-xs hover:bg-surface-2" data-testid="explain-all-start">
              {job.total && job.done === job.total ? "Done — update out-of-date ones" : "Start (in batches of 12)"}
            </button>
          )}
          {job.error && <p role="alert" className="text-xs text-danger">{job.error}</p>}
        </div>
      )}
    </article>
  );
}
