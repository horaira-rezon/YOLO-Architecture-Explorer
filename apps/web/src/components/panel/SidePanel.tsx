import { X } from "lucide-react";
import { formatCount, formatShape, getBlock } from "@yolo-atlas/core";
import { useAtlas } from "../../store/atlas";

export function SidePanel() {
  const { arch, computed, selectedId, select } = useAtlas();
  if (!arch || !computed || !selectedId) return null;
  const node = arch.nodes.find((n) => n.id === selectedId);
  const c = node ? computed.nodes[node.id] : undefined;
  const def = node ? getBlock(node.module) : undefined;
  return (
    <aside className="w-[380px] shrink-0 overflow-y-auto border-l border-border bg-surface p-4" aria-label="Details">
      <div className="flex items-start justify-between">
        <h2 className="text-lg font-semibold">{def?.displayName ?? selectedId}</h2>
        <button type="button" onClick={() => select(null)} className="rounded p-1 hover:bg-surface-2" aria-label="Close details"><X size={16} /></button>
      </div>
      {c && (
        <p className="mt-2 text-sm">Layer {c.index}. Output {formatShape(c.outShape)}, {formatCount(c.params)} parameters.</p>
      )}
    </aside>
  );
}
