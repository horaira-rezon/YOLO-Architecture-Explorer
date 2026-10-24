import * as Menu from "@radix-ui/react-dropdown-menu";
import { BookmarkPlus, ClipboardPaste, Copy, CopyPlus, GitCompare, Group, MousePointerSquareDashed, Redo2, RotateCcw, Scissors, Trash2, Undo2, X } from "lucide-react";
import type { Stage } from "@yolo-atlas/core";
import { useAtlas } from "../../store/atlas";
import { applyOps, copySelection, paste, redo, replaceArch, undo } from "../../store/lab";
import { saveTemplate } from "../../lib/persist";
import { ValidationButton } from "./ValidationPanel";
import { ExportMenu } from "./ExportMenu";
import { ImportDialog } from "./ImportDialog";
import { Snapshots } from "./Snapshots";

function Btn({ label, onClick, disabled, children, testid }: { label: string; onClick(): void; disabled?: boolean; children: React.ReactNode; testid?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className="rounded p-1.5 hover:bg-surface-2 disabled:opacity-30" data-testid={testid}>
      {children}
    </button>
  );
}

export function selectedIds(): string[] {
  const st = useAtlas.getState();
  return st.selection.length ? st.selection : st.selectedId && st.arch?.nodes.some((n) => n.id === st.selectedId) ? [st.selectedId] : [];
}

export function deleteSelected(mode: "bridge" | "dangling" = "bridge"): void {
  const st = useAtlas.getState();
  const ids = selectedIds().filter((id) => st.arch?.nodes.find((n) => n.id === id)?.stage !== "head");
  if (!ids.length) return;
  applyOps(ids.map((nodeId) => ({ op: "deleteNode" as const, nodeId, mode })), `Delete ${ids.length} block(s)`);
  st.select(null);
  st.setSelection([]);
}

export function groupSelected(): void {
  const ids = selectedIds();
  if (ids.length < 2) return;
  const name = window.prompt("Name for this group", "My block");
  if (name) applyOps([{ op: "groupNodes", nodeIds: ids, name }], `Group ${ids.length} blocks`);
}

export function LabToolbar({ modelKey }: { modelKey: string }) {
  const { past, future, clipboard, selection, selectedId, diffView, setDiffView, original, arch, labError, setSelection } = useAtlas();
  const hasSel = selection.length > 0 || (!!selectedId && !!arch?.nodes.some((n) => n.id === selectedId));
  const stages: Stage[] = ["backbone", "neck", "head"];
  return (
    <div className="relative flex flex-wrap items-center gap-0.5 border-b border-border bg-surface px-2 py-1" role="toolbar" aria-label="Lab tools" data-testid="lab-toolbar">
      <Btn label="Undo (Ctrl+Z)" onClick={undo} disabled={!past.length} testid="undo"><Undo2 size={16} /></Btn>
      <Btn label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!future.length} testid="redo"><Redo2 size={16} /></Btn>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      <Btn label="Cut (Ctrl+X)" onClick={() => copySelection(true)} disabled={!hasSel}><Scissors size={16} /></Btn>
      <Btn label="Copy (Ctrl+C)" onClick={() => copySelection(false)} disabled={!hasSel}><Copy size={16} /></Btn>
      <Btn label="Paste after the selected layer (Ctrl+V)" onClick={paste} disabled={!clipboard.length}><ClipboardPaste size={16} /></Btn>
      <Btn label="Duplicate (Ctrl+D)" onClick={() => { const ids = selectedIds(); if (ids.length) applyOps([{ op: "duplicateNodes", nodeIds: ids }], "Duplicate"); }} disabled={!hasSel}><CopyPlus size={16} /></Btn>
      <Btn label="Delete (Del) — reconnects around it" onClick={() => deleteSelected("bridge")} disabled={!hasSel} testid="toolbar-delete"><Trash2 size={16} /></Btn>
      <Btn label="Group the selected blocks (Ctrl+G)" onClick={groupSelected} disabled={selectedIds().length < 2}><Group size={16} /></Btn>
      <Btn label="Save the selection as a reusable template" onClick={() => {
        const st = useAtlas.getState();
        const nodes = st.arch?.nodes.filter((n) => selectedIds().includes(n.id) && n.stage !== "head") ?? [];
        const name = nodes.length ? window.prompt("Template name", "My block") : null;
        if (name) void saveTemplate({ id: crypto.randomUUID(), name, nodes: nodes.map(({ id, module, args, repeats, from, stage }) => ({ id, module, args, repeats, from, stage })) });
      }} disabled={!hasSel}><BookmarkPlus size={16} /></Btn>
      <Menu.Root>
        <Menu.Trigger className="rounded p-1.5 hover:bg-surface-2" aria-label="Select…" title="Select all / a stage"><MousePointerSquareDashed size={16} /></Menu.Trigger>
        <Menu.Portal>
          <Menu.Content className="z-50 rounded-lg border border-border bg-surface p-1 text-sm shadow-xl" sideOffset={4}>
            <Menu.Item className="cursor-pointer rounded px-2 py-1 outline-none data-[highlighted]:bg-surface-2" onSelect={() => setSelection(arch?.nodes.map((n) => n.id) ?? [])}>Select all (Ctrl+A)</Menu.Item>
            {stages.map((s) => <Menu.Item key={s} className="cursor-pointer rounded px-2 py-1 capitalize outline-none data-[highlighted]:bg-surface-2" onSelect={() => setSelection(arch?.nodes.filter((n) => n.stage === s).map((n) => n.id) ?? [])}>Select the {s}</Menu.Item>)}
            <Menu.Item className="cursor-pointer rounded px-2 py-1 outline-none data-[highlighted]:bg-surface-2" onSelect={() => setSelection([])}>Clear selection</Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      <button type="button" onClick={() => setDiffView(!diffView)} aria-pressed={diffView} className={`flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-surface-2 ${diffView ? "bg-surface-2 font-semibold" : ""}`} data-testid="diff-toggle"><GitCompare size={14} /> Changes</button>
      <Snapshots modelKey={modelKey} />
      <button type="button" disabled={!past.length} onClick={() => original && window.confirm("Go back to the original model? You can undo this.") && replaceArch(original, "Reset to original")} className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-surface-2 disabled:opacity-30"><RotateCcw size={14} /> Reset</button>
      <ImportDialog />
      <ExportMenu />
      <div className="ml-auto"><ValidationButton /></div>
      {selection.length > 1 && <span className="ml-2 text-xs text-muted">{selection.length} selected (shift-click / shift-drag to change)</span>}
      {labError && (
        <div role="alert" className="absolute left-1/2 top-full z-30 mt-2 flex max-w-xl -translate-x-1/2 items-start gap-2 rounded-lg border border-danger/50 bg-surface px-3 py-2 text-sm shadow-lg" data-testid="lab-error">
          <span className="text-danger">{labError}</span>
          <button type="button" onClick={() => useAtlas.setState({ labError: null })} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}
    </div>
  );
}
