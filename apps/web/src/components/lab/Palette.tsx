import { useMemo, useState } from "react";
import { GripVertical, Plus } from "lucide-react";
import { allBlocks, type BlockCategory } from "@yolo-atlas/core";
import { useAtlas } from "../../store/atlas";
import { applyOps } from "../../store/lab";
import { PRESETS, type PaletteItem } from "../../lib/labDefaults";
import { DRAG_TYPE, insertItem } from "../../lib/labPalette";
import { loadContent, useContentReady, CONTENT } from "../../lib/content";
import { useTemplates, type Template } from "../../lib/persist";

const GROUPS: { title: string; cats: BlockCategory[] }[] = [
  { title: "Convolutions", cats: ["conv"] },
  { title: "Feature blocks (CSP / ELAN)", cats: ["csp"] },
  { title: "Attention", cats: ["attention"] },
  { title: "Pooling & downsampling", cats: ["pooling", "downsample"] },
  { title: "Resize & merge", cats: ["resample", "merge"] },
  { title: "Extras from the literature", cats: ["extra"] },
];

export function Palette({ sheet = false }: { sheet?: boolean }) {
  useContentReady((s) => s.ready);
  void loadContent();
  const [q, setQ] = useState("");
  const level = useAtlas((s) => s.readingLevel);
  const templates = useTemplates();
  const items = useMemo(() => {
    const blocks = allBlocks().filter((b) => !b.isHead && b.id !== "Identity" && b.id !== "CBLinear" && b.id !== "CBFuse");
    return GROUPS.map((g) => ({
      title: g.title,
      items: blocks.filter((b) => g.cats.includes(b.category)).map<PaletteItem>((b) => ({
        key: b.id, label: b.displayName, module: b.yamlName, hint: CONTENT.get(b.id)?.whatIsIt[level] ?? "",
      })),
    }));
  }, [level]);
  const match = (i: PaletteItem) => !q || `${i.label} ${i.module}`.toLowerCase().includes(q.toLowerCase());
  const row = (i: PaletteItem) => (
    <li key={i.key}>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(i.key));
          e.dataTransfer.effectAllowed = "copy";
        }}
        className="group flex cursor-grab items-center gap-1 rounded px-1.5 py-1 text-sm hover:bg-surface-2"
        title={i.hint}
        data-testid={`palette-${i.key}`}
      >
        <GripVertical size={12} className="text-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{i.label}</span>
        <button type="button" onClick={() => { insertItem(i); if (sheet) useAtlas.setState({ paletteSheet: false }); }} className="rounded p-0.5 opacity-60 hover:bg-surface hover:opacity-100 focus:opacity-100" aria-label={`Insert ${i.label} after the selected layer`}>
          <Plus size={14} />
        </button>
      </div>
    </li>
  );
  const tplItems = templates.map((t: Template) => t);
  return (
    <aside className={sheet ? "fixed inset-x-0 bottom-0 z-40 flex max-h-[60vh] flex-col rounded-t-2xl border-t border-border bg-surface shadow-2xl lg:hidden" : "hidden w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex"} aria-label="Block palette" data-testid={sheet ? "palette-sheet" : "palette"}>
      {sheet && <button type="button" onClick={() => useAtlas.setState({ paletteSheet: false })} className="self-end px-3 pt-2 text-sm text-muted">Close</button>}
      <div className="border-b border-border p-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a block…" aria-label="Find a block" className="w-full rounded border border-border bg-bg px-2 py-1 text-sm" />
        <p className="mt-1 text-[11px] text-muted">Drag onto a layer to insert after it, or press + to insert after the selected layer.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Ready-made</h3>
        <ul className="mb-2">{PRESETS.filter(match).map(row)}</ul>
        {items.map((g) => {
          const list = g.items.filter(match);
          return list.length ? (
            <div key={g.title} className="mb-2">
              <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{g.title}</h3>
              <ul>{list.map(row)}</ul>
            </div>
          ) : null;
        })}
        {tplItems.length > 0 && (
          <div className="mb-2">
            <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">My templates</h3>
            <ul>
              {tplItems.map((t) => (
                <li key={t.id}>
                  <button type="button" className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-sm hover:bg-surface-2"
                    onClick={() => {
                      const st = useAtlas.getState();
                      const after = st.selectedId ?? st.arch?.nodes[st.arch.nodes.length - 2]?.id;
                      if (after) applyOps([{ op: "pasteNodes", nodes: t.nodes, after }], `Insert template ${t.name}`);
                    }}>
                    <Plus size={12} aria-hidden /> {t.name} <span className="text-xs text-muted">({t.nodes.length})</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}

