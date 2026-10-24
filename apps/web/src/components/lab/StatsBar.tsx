import { useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { computeArchitecture, formatCount, type ComputeResult, type Stage } from "@yolo-atlas/core";
import { useAtlas } from "../../store/atlas";

const pct = (a: number, b: number) => (a ? `${b >= a ? "+" : ""}${(((b - a) / a) * 100).toFixed(1)}%` : "—");

function byStage(comp: ComputeResult, nodes: { id: string; stage: Stage }[]) {
  const out: Record<string, { params: number; flops: number }> = {};
  for (const n of nodes) {
    const c = comp.nodes[n.id];
    const s = (out[n.stage] ??= { params: 0, flops: 0 });
    s.params += c?.params ?? 0;
    s.flops += c?.flops ?? 0;
  }
  return out;
}

/** Live totals and change vs the original. Speed is never estimated here. */
export function StatsBar() {
  const { arch, computed, original } = useAtlas();
  const orig = useMemo(() => (original ? computeArchitecture(original) : null), [original]);
  if (!arch || !computed || !orig || !original) return null;
  const p = computed.totals.params, g = computed.totals.gflops;
  const mb32 = (p * 4) / 1e6, mb16 = (p * 2) / 1e6;
  const sa = byStage(orig, original.nodes), sb = byStage(computed, arch.nodes);
  const broken = Object.values(computed.nodes).filter((n) => !n.outShape).length;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-surface px-3 py-1.5 text-xs" data-testid="stats-bar" aria-live="polite">
      <span><strong>{formatCount(p)}</strong> params <span className={p > orig.totals.params ? "text-warn" : "text-ok"}>({pct(orig.totals.params, p)})</span></span>
      <span><strong>{g.toFixed(1)}</strong> GFLOPs at {arch.inputSize} <span className={g > orig.totals.gflops ? "text-warn" : "text-ok"}>({pct(orig.totals.gflops, g)})</span></span>
      <span>≈ {mb32.toFixed(1)} MB (FP32) / {mb16.toFixed(1)} MB (FP16) weights</span>
      {broken > 0 && <span className="font-semibold text-danger" data-testid="stats-incomplete">Incomplete: {broken} layer{broken > 1 ? "s" : ""} cannot be computed until the errors are fixed.</span>}
      <span className="text-muted">Speed depends on your device: measure it there; no FPS is estimated here.</span>
      <Dialog.Root>
        <Dialog.Trigger className="ml-auto rounded border border-border px-2 py-0.5 hover:bg-surface-2">Compare with original</Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
          <Dialog.Content className="fixed left-1/2 top-[15vh] z-50 w-[min(560px,calc(100vw-24px))] -translate-x-1/2 rounded-xl border border-border bg-surface p-4 shadow-2xl" aria-describedby={undefined}>
            <div className="flex items-center justify-between"><Dialog.Title className="font-semibold">Original vs modified</Dialog.Title><Dialog.Close aria-label="Close"><X size={16} /></Dialog.Close></div>
            <table className="mt-3 w-full text-sm">
              <thead><tr className="text-left text-muted"><th>Part</th><th>Params (orig → new)</th><th>GFLOPs (orig → new)</th></tr></thead>
              <tbody>
                {["backbone", "neck", "head"].map((s) => (
                  <tr key={s}>
                    <td className="capitalize">{s}</td>
                    <td>{formatCount(sa[s]?.params ?? 0)} → {formatCount(sb[s]?.params ?? 0)} <span className="text-muted">{pct(sa[s]?.params ?? 0, sb[s]?.params ?? 0)}</span></td>
                    <td>{((sa[s]?.flops ?? 0) / 1e9).toFixed(2)} → {((sb[s]?.flops ?? 0) / 1e9).toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="font-semibold"><td>Total</td><td>{formatCount(orig.totals.params)} → {formatCount(p)}</td><td>{orig.totals.gflops.toFixed(2)} → {g.toFixed(2)}</td></tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">Original numbers are at {original.inputSize}×{original.inputSize}, modified at {arch.inputSize}×{arch.inputSize}.</p>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
