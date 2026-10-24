import { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Camera } from "lucide-react";
import { useAtlas } from "../../store/atlas";
import { replaceArch } from "../../store/lab";
import { deleteSnapshot, listSnapshots, saveSnapshot, type Snapshot } from "../../lib/persist";

export function Snapshots({ modelKey }: { modelKey: string }) {
  const arch = useAtlas((s) => s.arch);
  const [list, setList] = useState<Snapshot[]>([]);
  const [name, setName] = useState("");
  useEffect(() => {
    void listSnapshots(modelKey).then(setList);
  }, [modelKey]);
  return (
    <Popover.Root>
      <Popover.Trigger className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-surface-2"><Camera size={14} /> Snapshots</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} className="z-50 w-80 rounded-xl border border-border bg-surface p-3 text-sm shadow-xl">
          <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); if (arch && name.trim()) void saveSnapshot(modelKey, name.trim(), arch).then((l) => { setList(l); setName(""); }); }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this version" aria-label="Snapshot name" className="flex-1 rounded border border-border bg-bg px-2 py-1" />
            <button type="submit" className="rounded bg-accent px-2 text-accent-fg">Save</button>
          </form>
          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
            {list.length === 0 && <li className="text-muted">No snapshots yet. They stay in this browser.</li>}
            {list.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded border border-border px-2 py-1">
                <span className="min-w-0 flex-1 truncate">{s.name}<span className="block text-[11px] text-muted">{new Date(s.createdAt).toLocaleString()}</span></span>
                <button type="button" className="text-xs text-accent underline" onClick={() => replaceArch(s.arch, `Restore snapshot ${s.name}`)}>Restore</button>
                <button type="button" className="text-xs text-danger" onClick={() => void deleteSnapshot(modelKey, s.id).then(setList)} aria-label={`Delete snapshot ${s.name}`}>×</button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
