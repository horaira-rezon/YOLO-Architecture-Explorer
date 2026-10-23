import { formatCount, formatShape, getBlock, levelLabel, summarizeArgs, type Architecture, type ComputeResult } from "@yolo-atlas/core";
import { STAGE_CONTENT } from "../lib/stages";
import { useAtlas } from "../store/atlas";

/** Screen-reader friendly text version of the diagram: every layer in order with its connections. */
export function ListView({ arch, comp }: { arch: Architecture; comp: ComputeResult }) {
  const select = useAtlas((s) => s.select);
  const selectedId = useAtlas((s) => s.selectedId);
  const idx = comp.indexOf;
  return (
    <ol className="mx-auto max-w-3xl space-y-1 p-4" aria-label="Layers in order">
      {arch.nodes.filter((n) => n.origin !== "removed-ghost").map((n) => {
        const c = comp.nodes[n.id];
        const def = getBlock(n.module);
        const from = n.from.length ? n.from.map((f) => `layer ${idx[f]}`).join(", ") : "the image";
        const to = (comp.consumers[n.id] ?? []).map((t) => `layer ${idx[t]}`).join(", ");
        return (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => select(n.id)}
              aria-current={selectedId === n.id}
              className={`w-full rounded border px-3 py-2 text-left hover:bg-surface-2 ${selectedId === n.id ? "border-accent" : "border-border"} bg-surface`}
            >
              <span className="font-mono text-xs text-muted">{c?.index}</span>{" "}
              <strong>{def?.displayName ?? n.module}</strong>{" "}
              <span className="text-sm text-muted">({STAGE_CONTENT[n.stage].title})</span>
              <span className="block text-sm">
                {summarizeArgs(n, c)} — output {formatShape(c?.outShape)}
                {levelLabel(c?.stride ?? null) ? ` (${levelLabel(c?.stride ?? null)})` : ""}, {formatCount(c?.params ?? 0)} parameters.
              </span>
              <span className="block text-xs text-muted">Reads from {from}.{to ? ` Sends to ${to}.` : ""}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
