import * as Slider from "@radix-ui/react-slider";
import { Expand, Shrink } from "lucide-react";
import { useAtlas, type ZoomLevel } from "../store/atlas";

const NAMES: Record<ZoomLevel, string> = { 0: "Stages", 1: "Layers", 2: "Block parts", 3: "Operations", 4: "Code & math" };

/** L0–L4 slider plus expand/collapse for the inside view. */
export function ZoomBar() {
  const { zoomLevel, setZoomLevel, inside, autoZoom, setAutoZoom } = useAtlas();
  return (
    <div className="flex items-center gap-2 text-xs" data-testid="zoom-bar">
      <span className="hidden text-muted lg:inline">Zoom level</span>
      <Slider.Root
        className="relative flex h-5 w-28 touch-none select-none items-center"
        min={0}
        max={4}
        step={1}
        value={[zoomLevel]}
        onValueChange={([v]) => setZoomLevel((v ?? 1) as ZoomLevel)}
        aria-label="Zoom level"
      >
        <Slider.Track className="relative h-1 grow rounded-full bg-surface-2"><Slider.Range className="absolute h-full rounded-full bg-accent" /></Slider.Track>
        <Slider.Thumb aria-label="Zoom level" className="block h-4 w-4 rounded-full border-2 border-accent bg-surface focus-visible:outline-2" aria-valuetext={`L${zoomLevel} ${NAMES[zoomLevel]}`} />
      </Slider.Root>
      <span className="w-24 font-medium" aria-live="polite">L{zoomLevel} {NAMES[zoomLevel]}</span>
      {inside && (
        zoomLevel >= 3 ? (
          <button type="button" className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 hover:bg-surface-2" onClick={() => setZoomLevel(2)}><Shrink size={12} /> Collapse all</button>
        ) : (
          <button type="button" className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 hover:bg-surface-2" onClick={() => setZoomLevel(3)}><Expand size={12} /> Expand all</button>
        )
      )}
      <label className="hidden items-center gap-1 text-muted xl:flex" title="Zooming the mouse wheel far out or in changes level, like a map">
        <input type="checkbox" checked={autoZoom} onChange={(e) => setAutoZoom(e.target.checked)} /> auto
      </label>
    </div>
  );
}
