import { useMemo } from "react";
import * as Popover from "@radix-ui/react-popover";
import { AlertCircle, AlertTriangle, CheckCircle2, Wrench } from "lucide-react";
import { validate } from "@yolo-atlas/core";
import { useAtlas } from "../../store/atlas";
import { applyOps } from "../../store/lab";

/** Errors and warnings with click-to-jump and one-click fixes. */
export function ValidationButton() {
  const { arch, computed, select, centerOn } = useAtlas();
  const issues = useMemo(() => (arch && computed ? validate(arch, computed) : []), [arch, computed]);
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.length - errors;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${errors ? "bg-danger/15 text-danger" : warnings ? "bg-warn/15 text-warn" : "bg-ok/15 text-ok"}`} data-testid="validation-button">
          {errors ? <AlertCircle size={14} aria-hidden /> : warnings ? <AlertTriangle size={14} aria-hidden /> : <CheckCircle2 size={14} aria-hidden />}
          {errors ? `${errors} error${errors > 1 ? "s" : ""}` : warnings ? `${warnings} warning${warnings > 1 ? "s" : ""}` : "Valid"}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} align="end" className="z-50 max-h-[60vh] w-[min(420px,calc(100vw-24px))] overflow-y-auto rounded-xl border border-border bg-surface p-2 text-sm shadow-xl" data-testid="validation-panel">
          {issues.length === 0 && <p className="p-2 text-ok">No problems found. The model can be built.</p>}
          <ul className="space-y-1">
            {issues.map((i, k) => (
              <li key={k} className={`rounded-lg border p-2 ${i.severity === "error" ? "border-danger/50" : "border-warn/50"}`}>
                <button type="button" className="block w-full text-left" disabled={!i.nodeId} onClick={() => { if (i.nodeId) { select(i.nodeId); centerOn(i.nodeId); } }}>
                  <span className={`text-xs font-semibold uppercase ${i.severity === "error" ? "text-danger" : "text-warn"}`}>{i.severity}</span>
                  {i.nodeId && computed?.nodes[i.nodeId] && <span className="ml-2 text-xs text-muted">layer {computed.nodes[i.nodeId]!.index}</span>}
                  <span className="block">{i.message}</span>
                </button>
                {i.suggestedFix && (
                  <button type="button" onClick={() => applyOps(i.suggestedFix!.ops, i.suggestedFix!.label)} className="mt-1 flex items-center gap-1 rounded bg-accent px-2 py-0.5 text-xs text-accent-fg" data-testid="apply-fix">
                    <Wrench size={12} aria-hidden /> {i.suggestedFix.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
