import { OperationError, applyOperation, applyOperations, toOperation, type Architecture, type Operation, type Patch, type PatchOp } from "@yolo-atlas/core";
import { useAtlas } from "./atlas";

export interface HistoryEntry {
  label: string;
  arch: Architecture;
}

let opCounter = 0;
const newOpId = () => `op${Date.now().toString(36)}${(opCounter++).toString(36)}`;

/**
 * Run operations through the core pipeline as ONE undoable step.
 * Returns the error message (plain language) or null on success.
 */
export function applyOps(ops: Operation[], label: string, opts: { opId?: string; summary?: string } = {}): string | null {
  const st = useAtlas.getState();
  if (!st.arch) return "No model is loaded.";
  try {
    const next = applyOperations(st.arch, ops, { opId: opts.opId ?? newOpId(), summary: opts.summary });
    useAtlas.setState({ past: [...st.past, { label, arch: st.arch }].slice(-500), future: [], labError: null });
    st.setArch(next);
    return null;
  } catch (e) {
    const msg = e instanceof OperationError ? e.message : e instanceof Error ? `That edit could not be applied: ${e.message}` : String(e);
    useAtlas.setState({ labError: msg });
    return msg;
  }
}

export function undo(): void {
  const st = useAtlas.getState();
  const last = st.past[st.past.length - 1];
  if (!last || !st.arch) return;
  useAtlas.setState({ past: st.past.slice(0, -1), future: [{ label: last.label, arch: st.arch }, ...st.future] });
  st.setArch(last.arch);
}

export function redo(): void {
  const st = useAtlas.getState();
  const next = st.future[0];
  if (!next || !st.arch) return;
  useAtlas.setState({ future: st.future.slice(1), past: [...st.past, { label: next.label, arch: st.arch }] });
  st.setArch(next.arch);
}

/** Replace the whole architecture as one undoable step (import, snapshot restore, reset). */
export function replaceArch(arch: Architecture, label: string, asOriginal = false): void {
  const st = useAtlas.getState();
  if (st.arch) useAtlas.setState({ past: [...st.past, { label, arch: st.arch }], future: [] });
  if (asOriginal) useAtlas.setState({ original: arch });
  st.setArch(arch);
}

export function copySelection(cut = false): void {
  const st = useAtlas.getState();
  if (!st.arch) return;
  const ids = st.selection.length ? st.selection : st.selectedId ? [st.selectedId] : [];
  const nodes = st.arch.nodes.filter((n) => ids.includes(n.id) && n.stage !== "head");
  if (!nodes.length) return;
  useAtlas.setState({ clipboard: nodes.map(({ id, module, args, repeats, from, stage }) => ({ id, module, args, repeats, from, stage })) });
  if (cut) applyOps(nodes.map((n) => ({ op: "deleteNode", nodeId: n.id, mode: "bridge" as const })), `Cut ${nodes.length} block(s)`);
}

export function paste(): void {
  const st = useAtlas.getState();
  const after = st.selectedId ?? st.arch?.nodes[st.arch.nodes.length - 2]?.id;
  if (!st.clipboard.length || !after) return;
  applyOps([{ op: "pasteNodes", nodes: st.clipboard, after }], `Paste ${st.clipboard.length} block(s)`);
}

/** Apply chosen operations of an AI patch as ONE undoable step; each changed node records "<session>.<index>". */
export function applyPatch(sessionId: string, patch: Patch, selected: number[]): { error: string | null; notes: Record<string, PatchOp> } {
  const st = useAtlas.getState();
  if (!st.arch) return { error: "No model is loaded.", notes: {} };
  let arch = st.arch;
  const notes: Record<string, PatchOp> = {};
  try {
    for (const i of [...selected].sort((a, b) => a - b)) {
      const p = patch.operations[i]!;
      const opId = `${sessionId}.${i}`;
      arch = applyOperation(arch, toOperation(p), { opId, summary: p.rationaleSimple });
      notes[opId] = p;
    }
  } catch (e) {
    const msg = `Operation could not be applied: ${(e as Error).message}`;
    useAtlas.setState({ labError: msg });
    return { error: msg, notes: {} };
  }
  useAtlas.setState({ past: [...st.past, { label: "AI patch", arch: st.arch }].slice(-500), future: [], labError: null });
  st.setArch(arch);
  return { error: null, notes };
}
