import { Loader2, RefreshCw } from "lucide-react";
import { useAtlas } from "../../store/atlas";
import { useGoalContext } from "../../lib/goalContext";

/** Section 8 of the panel: how this block helps the user's goal (AI-generated, labelled). */
export function GoalSection({ nodeId }: { nodeId: string }) {
  const { lookup, loading, error, regenerate, hasGoal } = useGoalContext(nodeId);
  const node = useAtlas((s) => s.arch?.nodes.find((n) => n.id === nodeId));
  const op = useAtlas((s) => (node?.modification ? s.aiSession?.notes[node.modification.opId] : undefined));
  if (!hasGoal) return <p className="text-muted">Set a goal in the AI Architect (Lab) to see how each block helps it.</p>;
  return (
    <div className="space-y-2" data-testid="goal-section">
      {op && (
        <div className="rounded-lg border border-accent/40 bg-accent/5 p-2">
          <p className="text-[10px] font-semibold uppercase text-accent">Why the AI changed it</p>
          <p>{op.rationaleSimple}</p>
          <p><strong>For your goal:</strong> {op.rationaleForGoal}</p>
          <p className="text-muted"><strong>Trade-off:</strong> {op.tradeoff}</p>
        </div>
      )}
      {node && node.origin === "builtin" && <p className="text-muted">This block is unchanged.</p>}
      {loading && lookup.state === "none" && <p role="status" className="flex items-center gap-1 text-muted"><Loader2 size={14} className="animate-spin" /> Writing an explanation for your goal…</p>}
      {error && <p role="alert" className="text-danger">{error}</p>}
      {lookup.state !== "none" && (
        <div className={`space-y-1 ${lookup.state === "stale" ? "opacity-70" : ""}`}>
          <p><strong>Its role here:</strong> {lookup.data.role}</p>
          <p><strong>For your goal:</strong> {lookup.data.contribution}</p>
          <p><strong>How it works at this spot:</strong> {lookup.data.howItWorksHere}</p>
          <p><strong>Without it:</strong> {lookup.data.whatWouldBreak}</p>
          <p><strong>Cost:</strong> {lookup.data.tradeoff}</p>
          <p className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase">
            <span className="rounded bg-warn/15 px-1 text-warn">AI-generated · not verified</span>
            {lookup.state === "stale" && <span className="rounded bg-danger/15 px-1 text-danger" data-testid="goal-stale">out of date: this block or a neighbour changed</span>}
            <button type="button" onClick={() => void regenerate()} disabled={loading} className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 normal-case text-fg hover:bg-surface-2"><RefreshCw size={11} className={loading ? "animate-spin" : ""} /> {lookup.state === "stale" ? "Update" : "Regenerate"}</button>
          </p>
        </div>
      )}
    </div>
  );
}
