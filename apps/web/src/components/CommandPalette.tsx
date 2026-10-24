import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useNavigate } from "react-router-dom";
import { BookOpen, Box, GitBranch, Search } from "lucide-react";
import { VERSIONS, formatShape, getBlock } from "@yolo-atlas/core";
import { useAtlas } from "../store/atlas";
import { GLOSSARY } from "../lib/content";

interface Result {
  key: string;
  kind: "layer" | "term" | "version";
  title: string;
  detail: string;
  run(): void;
}

/** Ctrl/Cmd-K or "/": jump to a layer, look up a glossary term, or switch version. */
export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, arch, computed, select, centerOn, exitInside, readingLevel } = useAtlas();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const results = useMemo<Result[]>(() => {
    const query = q.trim().toLowerCase();
    const out: Result[] = [];
    if (arch && computed) {
      for (const n of arch.nodes) {
        const c = computed.nodes[n.id];
        const name = getBlock(n.module)?.displayName ?? n.module;
        const hay = `${c?.index} ${name} ${n.module} ${n.stage}`.toLowerCase();
        if (!query || hay.includes(query)) out.push({
          key: n.id, kind: "layer", title: `${c?.index} ${name}`, detail: `${n.stage} · ${formatShape(c?.outShape)}`,
          run: () => { exitInside(); select(n.id); centerOn(n.id); },
        });
      }
    }
    if (query) {
      for (const t of GLOSSARY) {
        if ([t.term, ...t.aliases].some((a) => a.toLowerCase().includes(query)))
          out.push({ key: `t:${t.term}`, kind: "term", title: t.term, detail: t[readingLevel], run: () => setQ(t.term) });
      }
      for (const v of VERSIONS.filter((x) => x.status === "released")) {
        if (v.label.toLowerCase().includes(query) || v.id === query)
          out.push({ key: `v:${v.id}`, kind: "version", title: `Open ${v.label}`, detail: v.bigIdea.simple, run: () => navigate(`/explore/${v.id}/${arch?.task && v.tasks[arch.task].supported ? arch.task : "detect"}`) });
      }
    }
    return out.slice(0, 40);
  }, [q, arch, computed, readingLevel, select, centerOn, exitInside, navigate]);

  const choose = (r: Result | undefined) => {
    if (!r) return;
    r.run();
    if (r.kind !== "term") {
      setPaletteOpen(false);
      setQ("");
    }
  };

  return (
    <Dialog.Root open={paletteOpen} onOpenChange={(o) => { setPaletteOpen(o); if (!o) setQ(""); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-[12vh] z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search size={16} className="text-muted" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => { setQ(e.target.value); setActive(0); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === "Enter") { e.preventDefault(); choose(results[active]); }
              }}
              placeholder="Find a layer, a word, or a version…"
              aria-label="Search"
              role="combobox"
              aria-expanded
              aria-controls="palette-results"
              aria-activedescendant={results[active] ? `pr-${results[active]!.key}` : undefined}
              className="h-12 flex-1 bg-transparent outline-none"
              data-testid="palette-input"
            />
          </div>
          <ul id="palette-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-1">
            {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Nothing found.</li>}
            {results.map((r, i) => {
              const Icon = r.kind === "layer" ? Box : r.kind === "term" ? BookOpen : GitBranch;
              return (
                <li
                  key={r.key}
                  id={`pr-${r.key}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(r)}
                  className={`flex cursor-pointer gap-2 rounded-lg px-3 py-2 text-sm ${i === active ? "bg-surface-2" : ""}`}
                >
                  <Icon size={15} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0">
                    <span className="font-medium">{r.title}</span>
                    <span className={`block text-xs text-muted ${r.kind === "term" ? "" : "truncate"}`}>{r.detail}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
