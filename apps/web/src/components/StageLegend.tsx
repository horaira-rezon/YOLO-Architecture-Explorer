import type { Stage } from "@yolo-atlas/core";
import { STAGE_CONTENT, STAGE_STYLE } from "../lib/stages";

const ORDER: Stage[] = ["input", "backbone", "neck", "head", "postprocess", "loss"];

export function StageLegend() {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Stage colours">
      {ORDER.map((s) => {
        const st = STAGE_STYLE[s];
        const Icon = st.icon;
        return (
          <li key={s} className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded-sm ${s === "loss" ? "border border-dashed" : ""}`} style={{ background: st.color, borderColor: st.color }} aria-hidden />
            <Icon size={12} style={{ color: st.color }} aria-hidden />
            {STAGE_CONTENT[s].title}
          </li>
        );
      })}
      <li className="flex items-center gap-1 text-muted">
        <svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke="currentColor" strokeDasharray="5 3" /></svg>
        skip / lateral link
      </li>
    </ul>
  );
}
