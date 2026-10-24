import { ChevronRight } from "lucide-react";
import { useAtlas } from "../../store/atlas";

/** "YOLOv8n › Backbone › Layer 6 C2f › m › 0" with each crumb clickable. */
export function Breadcrumbs() {
  const { arch, computed, inside, selectedId, enter, exitInside, insideSelect } = useAtlas();
  if (!arch || !computed) return null;
  const nodeId = inside?.nodeId ?? selectedId;
  const node = nodeId ? arch.nodes.find((n) => n.id === nodeId) : undefined;
  const c = node ? computed.nodes[node.id] : undefined;
  const segs = inside?.path ? inside.path.split(".") : [];
  const crumbs: { label: string; onClick?: () => void }[] = [
    { label: `${arch.version} ${arch.task} ${arch.config.scale ?? ""}`.trim(), onClick: exitInside },
  ];
  if (node) crumbs.push({ label: node.stage[0]!.toUpperCase() + node.stage.slice(1), onClick: exitInside });
  if (node && c) crumbs.push({ label: `Layer ${c.index} ${node.module}`, onClick: inside ? () => enter(node.id, "") : () => enter(node.id) });
  segs.forEach((s, i) => crumbs.push({ label: s, onClick: () => enter(node!.id, segs.slice(0, i + 1).join(".")) }));
  if (inside?.selected) crumbs.push({ label: inside.selected.split(".").slice(segs.length).join(" › "), onClick: () => insideSelect(inside.selected) });
  return (
    <nav aria-label="Breadcrumbs" className="flex min-w-0 items-center gap-0.5 overflow-x-auto text-xs" data-testid="breadcrumbs">
      {crumbs.map((cr, i) => (
        <span key={i} className="flex shrink-0 items-center gap-0.5">
          {i > 0 && <ChevronRight size={12} className="text-muted" aria-hidden />}
          {cr.onClick && i < crumbs.length - 1 ? (
            <button type="button" className="rounded px-1 py-0.5 hover:bg-surface-2" onClick={cr.onClick}>{cr.label}</button>
          ) : (
            <span className="px-1 py-0.5 font-semibold" aria-current="location">{cr.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
