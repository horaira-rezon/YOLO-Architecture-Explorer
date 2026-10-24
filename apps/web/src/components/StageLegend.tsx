import type { Stage } from "@yolo-atlas/core";
import { STAGE_CONTENT, STAGE_STYLE } from "../lib/stages";
import { useAtlas } from "../store/atlas";

const ORDER: Stage[] = ["input", "backbone", "neck", "head", "postprocess", "loss"];

export function StageLegend() {
  const select = useAtlas((s) => s.select);
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Stage colours">
      {ORDER.map((s) => {
        const st = STAGE_STYLE[s];
        const Icon = st.icon;
        return (
          <li key={s}>
            <button type="button" onClick={() => select(`stage:${s}`)} className="flex min-h-6 items-center gap-1 rounded px-1 hover:bg-surface-2" title={`What is the ${STAGE_CONTENT[s].title.toLowerCase()}?`}>
              <span className={`inline-block h-3 w-3 rounded-sm ${s === "loss" ? "border border-dashed" : ""}`} style={{ background: st.color, borderColor: st.color }} aria-hidden />
              <Icon size={12} style={{ color: st.color }} aria-hidden />
              {STAGE_CONTENT[s].title}
            </button>
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
