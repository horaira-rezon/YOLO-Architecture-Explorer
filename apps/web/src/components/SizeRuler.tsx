import type { Architecture, ComputeResult } from "@yolo-atlas/core";

/** Feature maps drawn to scale (side ∝ height) so learners see them shrink at each stride. */
export function SizeRuler({ arch, comp }: { arch: Architecture; comp: ComputeResult }) {
  const sizes = new Map<number, number>();
  sizes.set(arch.inputSize, 1);
  for (const c of Object.values(comp.nodes)) {
    if (c.outShape?.length === 3 && c.stride) sizes.set(c.outShape[1]!, c.stride);
  }
  const list = [...sizes.entries()].sort((a, b) => b[0] - a[0]);
  const scale = 96 / arch.inputSize;
  return (
    <figure className="rounded-lg border border-border bg-surface p-2" aria-label="Feature map size ruler">
      <figcaption className="mb-1 text-xs font-semibold">Map size (drawn to scale)</figcaption>
      <div className="flex items-end gap-2">
        {list.map(([h, stride]) => (
          <div key={h} className="flex flex-col items-center gap-0.5">
            <span className="block border border-fg/70 bg-accent/10" style={{ width: Math.max(1, h * scale), height: Math.max(1, h * scale) }} />
            <span className="font-mono text-[10px]">{h}</span>
            <span className="text-[10px] text-muted">{stride === 1 ? "image" : `/${stride}`}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
