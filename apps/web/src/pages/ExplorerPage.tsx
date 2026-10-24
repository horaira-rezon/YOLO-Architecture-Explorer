import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowDownUp, ArrowLeftRight, Footprints, LayoutGrid, List, Network, Search, Workflow } from "lucide-react";
import { TASKS, VERSIONS, formatCount, getVersion, type Task } from "@yolo-atlas/core";
import { loadArchitecture } from "../lib/modelData";
import { buildDisplayGraph } from "../graph/displayGraph";
import { layoutGraph, type LayoutResult } from "../graph/layout";
import { layoutClassic } from "../graph/classicLayout";
import { useAtlas } from "../store/atlas";
import { GraphCanvas } from "../components/canvas/GraphCanvas";
import { StageLegend } from "../components/StageLegend";
import { SizeRuler } from "../components/SizeRuler";
import type { Architecture, ComputeResult } from "@yolo-atlas/core";
import { ListView } from "../components/ListView";
import { SidePanel } from "../components/panel/SidePanel";
import { InsidePanel } from "../components/panel/InsidePanel";
import { InsideView, Breadcrumbs } from "../components/canvas/InsideView";
import { OverviewCanvas } from "../components/canvas/OverviewCanvas";
import { ZoomBar } from "../components/ZoomBar";
import { CommandPalette } from "../components/CommandPalette";
import { Walkthrough } from "../components/Walkthrough";
import { useKeyboardNav } from "../lib/keyboard";
import { Provenance } from "../components/Provenance";
import { Palette } from "../components/lab/Palette";
import { LabToolbar } from "../components/lab/LabToolbar";
import { StatsBar } from "../components/lab/StatsBar";
import { ModelSettings } from "../components/lab/ModelSettings";
import { useAutosave } from "../lib/autosave";
import { ArchitectPanel } from "../components/ai/ArchitectPanel";
import { computeArchitecture } from "@yolo-atlas/core";
import { FlaskConical, Telescope } from "lucide-react";

export function ExplorerPage({ mode }: { mode: "explore" | "lab" }) {
  const { version = "v8", task = "detect", scale } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { arch, computed, scales, direction, listView, layoutMode, selectedId, setLoaded, setDirection, setListView, setLayoutMode, select, zoomLevel, inside, walk, setWalk, setPaletteOpen } = useAtlas();
  useKeyboardNav();
  const original = useAtlas((s) => s.original);
  const diffView = useAtlas((s) => s.diffView);
  const aiPanelOpen = useAtlas((s) => s.aiPanelOpen);
  useEffect(() => useAtlas.getState().setMode(mode), [mode]);
  const modelKey = `${version}-${task}-${scale ?? "default"}`;
  const restore = useAutosave(mode === "lab", modelKey);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<LayoutResult | null>(null);
  const info = getVersion(version);

  // load the architecture for this URL
  useEffect(() => {
    let alive = true;
    setError(null);
    setLayout(null);
    loadArchitecture(version, task as Task, scale)
      .then(({ arch: a, scales: sc }) => {
        if (!alive) return;
        setLoaded(a, sc);
        const node = params.get("node");
        if (node) select(node);
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reload when the model changes
  }, [version, task, scale]);

  // keep ?node= in the URL so links are shareable
  useEffect(() => {
    const cur = params.get("node");
    if ((selectedId ?? null) !== cur) {
      const next = new URLSearchParams(params);
      if (selectedId) next.set("node", selectedId);
      else next.delete("node");
      setParams(next, { replace: true });
    }
  }, [selectedId, params, setParams]);

  const originalComp = useMemo(() => (original ? computeArchitecture(original) : null), [original]);
  const graph = useMemo(
    () => (arch && computed ? buildDisplayGraph(arch, computed, mode === "lab" && diffView && original && originalComp ? { original, originalComp } : undefined) : null),
    [arch, computed, mode, diffView, original, originalComp],
  );

  useEffect(() => {
    if (!graph) return;
    if (layoutMode === "classic") {
      setLayout(layoutClassic(graph, direction));
      return;
    }
    let alive = true;
    layoutGraph(graph, direction).then((l) => alive && setLayout(l)).catch((e: unknown) => alive && setError(`Layout failed: ${String(e)}`));
    return () => {
      alive = false;
    };
  }, [graph, direction, layoutMode]);

  const go = (v: string, t: string, s?: string) => navigate(`/${mode}/${v}/${t}${s ? `/${s}` : ""}`);
  const available = VERSIONS.filter((v) => v.status === "released" && v.tasks[task as Task]?.supported);

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Could not open this model</h1>
        <p className="mt-2 text-muted">{error}</p>
        <Link to={`/versions/${task}`} className="mt-6 inline-block rounded bg-accent px-4 py-2 text-accent-fg">Pick another version</Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2 text-sm">
        <label className="flex items-center gap-1">
          <span className="sr-only">Version</span>
          <select className="rounded border border-border bg-bg px-2 py-1" value={version} onChange={(e) => go(e.target.value, task)} aria-label="Version">
            {available.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </label>
        <select className="rounded border border-border bg-bg px-2 py-1" value={task} aria-label="Task"
          onChange={(e) => go(info?.tasks[e.target.value as Task]?.supported ? version : "v8", e.target.value)}>
          {TASKS.map((t) => <option key={t.id} value={t.id} disabled={!info?.tasks[t.id].supported}>{t.label}</option>)}
        </select>
        <select className="rounded border border-border bg-bg px-2 py-1" value={arch?.id.split("-").pop() ?? ""} aria-label="Model size"
          onChange={(e) => go(version, task, e.target.value)}>
          {scales.map((s) => <option key={s} value={s}>size {s}</option>)}
        </select>
        {arch && <Provenance arch={arch} info={info} />}
        <Link to={`/compare/${task}?a=${version}`} className="rounded px-1.5 py-1 text-xs hover:bg-surface-2" data-testid="compare-from-explorer">Compare</Link>
        <Link to={`/${mode === "lab" ? "explore" : "lab"}/${version}/${task}${scale ? `/${scale}` : ""}`} className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${mode === "lab" ? "bg-surface-2" : "bg-accent text-accent-fg"}`} data-testid="mode-toggle">
          {mode === "lab" ? <><Telescope size={14} /> Back to Explorer</> : <><FlaskConical size={14} /> Edit in Lab</>}
        </Link>
        <ZoomBar />
        <div className="ml-auto flex items-center gap-1">
          {computed && (
            <span className="mr-2 hidden text-xs text-muted md:inline" data-testid="stats">
              {formatCount(computed.totals.params)} parameters · {computed.totals.gflops.toFixed(1)} GFLOPs · {computed.totals.layers} layers
            </span>
          )}
          <button type="button" className={`flex items-center gap-1 rounded px-1.5 py-1 hover:bg-surface-2 ${walk.active ? "bg-surface-2" : ""}`}
            onClick={() => { setWalk({ active: !walk.active, playing: !walk.active, step: 0 }); if (inside) useAtlas.getState().exitInside(); setListView(false); }}
            aria-pressed={walk.active} title="Follow the image through the network" data-testid="walk-toggle">
            <Footprints size={16} /> <span className="hidden text-xs lg:inline">Follow the image</span>
          </button>
          <button type="button" className="rounded p-1.5 hover:bg-surface-2" onClick={() => setPaletteOpen(true)} aria-label="Search (Ctrl+K or /)" title="Search (Ctrl+K or /)">
            <Search size={16} />
          </button>
          <button type="button" className="rounded p-1.5 hover:bg-surface-2" onClick={() => setDirection(direction === "DOWN" ? "RIGHT" : "DOWN")}
            aria-label={direction === "DOWN" ? "Lay out left to right" : "Lay out top to bottom"} title="Change direction">
            {direction === "DOWN" ? <ArrowLeftRight size={16} /> : <ArrowDownUp size={16} />}
          </button>
          <button type="button" className="rounded p-1.5 hover:bg-surface-2" onClick={() => setLayoutMode(layoutMode === "classic" ? "flow" : "classic")}
            aria-label={layoutMode === "classic" ? "Use automatic flow layout" : "Use classic layout (rows by map size)"} title={layoutMode === "classic" ? "Automatic flow layout" : "Classic layout"}>
            {layoutMode === "classic" ? <Workflow size={16} /> : <LayoutGrid size={16} />}
          </button>
          <button type="button" className={`rounded p-1.5 hover:bg-surface-2 ${listView ? "bg-surface-2" : ""}`} onClick={() => setListView(!listView)}
            aria-pressed={listView} aria-label={listView ? "Show diagram" : "Show as a list"} title="List view">
            {listView ? <Network size={16} /> : <List size={16} />}
          </button>
        </div>
      </div>
      {info && (info.confidence === "draft" || info.id === "12") && (
        <div role="note" className="border-b border-warn/40 bg-warn/10 px-3 py-1.5 text-xs text-warn" data-testid="version-banner">
          {info.confidence === "draft" ? "This version could not be fully verified. Treat the diagram as a draft. " : ""}
          {info.notes[0]}
        </div>
      )}
      {mode === "lab" && <LabToolbar modelKey={modelKey} />}
      {restore && (
        <div role="note" className="flex items-center gap-2 border-b border-accent/40 bg-accent/10 px-3 py-1.5 text-sm" data-testid="restore-banner">
          You have unsaved Lab work for this model from {new Date(restore.savedAt).toLocaleString()}.
          <button type="button" className="rounded bg-accent px-2 py-0.5 text-accent-fg" onClick={restore.restore}>Continue it</button>
          <button type="button" className="rounded border border-border px-2 py-0.5" onClick={restore.discard}>Start fresh</button>
        </div>
      )}
      {arch && computed && (zoomLevel !== 1 || inside || selectedId) && (
        <div className="border-b border-border bg-surface px-3 py-1"><Breadcrumbs /></div>
      )}
      <div className="flex min-h-0 flex-1">
        {mode === "lab" && <Palette />}
        <div className="relative min-w-0 flex-1">
          {!arch || !computed ? (
            <div className="flex h-full items-center justify-center text-muted" role="status">Loading the model…</div>
          ) : inside && zoomLevel >= 2 ? (
            <InsideView />
          ) : zoomLevel === 0 && !listView ? (
            <OverviewCanvas arch={arch} comp={computed} />
          ) : listView ? (
            <div className="h-full overflow-auto"><ListView arch={arch} comp={computed} /></div>
          ) : !layout || !graph ? (
            <div className="flex h-full items-center justify-center text-muted" role="status">Arranging the diagram…</div>
          ) : (
            <GraphCanvas graph={graph} layout={layout} fitKey={`${arch.id}|${direction}|${layoutMode}|${zoomLevel}`} />
          )}
          {arch && computed && !listView && zoomLevel === 1 && !walk.active && <CanvasLegend arch={arch} comp={computed} />}
          {zoomLevel === 1 && !listView && <Walkthrough />}
        </div>
        {mode === "lab" && aiPanelOpen ? <ArchitectPanel /> : inside && zoomLevel >= 2 ? (inside.selected ? <InsidePanel /> : selectedId && <SidePanel />) : selectedId && arch && computed && !walk.active ? <SidePanel /> : mode === "lab" && arch ? (
          <aside className="hidden w-[380px] shrink-0 overflow-y-auto border-l border-border bg-surface md:block" aria-label="Whole-model settings"><ModelSettings /></aside>
        ) : null}
        <CommandPalette />
      </div>
      {mode === "lab" && <StatsBar />}
    </div>
  );
}

function CanvasLegend({ arch, comp }: { arch: Architecture; comp: ComputeResult }) {
  const [open, setOpen] = useState(() => window.innerWidth > 900);
  const [ruler, setRuler] = useState(false);
  return (
    <div className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-24px)] flex-col items-start gap-2">
      {open && ruler && <SizeRuler arch={arch} comp={comp} />}
      {open && (
        <div className="rounded-lg border border-border bg-surface/95 px-2 py-1.5 shadow-sm"><StageLegend /></div>
      )}
      <div className="flex gap-1">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="rounded border border-border bg-surface px-2 py-1 text-xs shadow-sm hover:bg-surface-2">
          {open ? "Hide legend" : "Legend"}
        </button>
        {open && (
          <button type="button" onClick={() => setRuler(!ruler)} aria-pressed={ruler} className="rounded border border-border bg-surface px-2 py-1 text-xs shadow-sm hover:bg-surface-2">
            {ruler ? "Hide map sizes" : "Map sizes"}
          </button>
        )}
      </div>
    </div>
  );
}
