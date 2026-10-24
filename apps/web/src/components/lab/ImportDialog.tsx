import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Upload, X } from "lucide-react";
import { YamlImportError, compileYaml, computeArchitecture, validate } from "@yolo-atlas/core";
import { useAtlas } from "../../store/atlas";
import { replaceArch } from "../../store/lab";

/** Paste or upload an Ultralytics-style YAML; problems are reported in plain words. */
export function ImportDialog() {
  const arch = useAtlas((s) => s.arch);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const run = () => {
    if (!arch) return;
    try {
      const scale = /^scales:/m.test(text) ? (text.match(/^\s{2}(\w+):\s*\[/m)?.[1] ?? null) : null;
      const imported = compileYaml(text, { version: arch.version, task: arch.task, scale, inputSize: arch.inputSize, id: `${arch.version}-${arch.task}-import`, meta: { source: { repo: "imported", file: "pasted YAML" }, confidence: "draft", retrievedAt: new Date().toISOString().slice(0, 10), notes: ["Imported by the user"] } });
      const issues = validate(imported, computeArchitecture(imported));
      replaceArch(imported, "Import YAML", true);
      setMsg({ ok: true, lines: [`Imported ${imported.nodes.length} layers.`, ...issues.map((i) => `${i.severity}: ${i.message}`)] });
    } catch (e) {
      const err = e as YamlImportError;
      setMsg({ ok: false, lines: [err instanceof YamlImportError ? `${err.message}${err.line ? ` (line ${err.line})` : ""}` : `Could not import: ${String(e)}`] });
    }
  };
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setMsg(null); }}>
      <Dialog.Trigger className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-surface-2" data-testid="import-yaml"><Upload size={14} /> Import</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-[10vh] z-50 w-[min(680px,calc(100vw-24px))] -translate-x-1/2 rounded-xl border border-border bg-surface p-4 shadow-2xl" aria-describedby={undefined}>
          <div className="flex items-center justify-between"><Dialog.Title className="font-semibold">Import an Ultralytics YAML</Dialog.Title><Dialog.Close aria-label="Close"><X size={16} /></Dialog.Close></div>
          <p className="mt-1 text-sm text-muted">Paste a model YAML (with backbone and head lists) or choose a file. It replaces the current Lab model; you can undo.</p>
          <input type="file" accept=".yaml,.yml,text/yaml" className="mt-2 text-sm" onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then(setText); }} aria-label="YAML file" />
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} className="mt-2 w-full rounded border border-border bg-bg p-2 font-mono text-xs" placeholder={"nc: 4\nbackbone:\n  - [-1, 1, Conv, [64, 3, 2]]\n..."} aria-label="YAML text" data-testid="import-text" />
          {msg && (
            <div role={msg.ok ? "status" : "alert"} className={`mt-2 rounded border p-2 text-sm ${msg.ok ? "border-ok/50" : "border-danger/50 text-danger"}`}>
              {msg.lines.map((l, i) => <p key={i}>{l}</p>)}
            </div>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Dialog.Close className="rounded border border-border px-3 py-1 text-sm">Close</Dialog.Close>
            <button type="button" onClick={run} disabled={!text.trim()} className="rounded bg-accent px-3 py-1 text-sm text-accent-fg disabled:opacity-40" data-testid="import-run">Import</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
