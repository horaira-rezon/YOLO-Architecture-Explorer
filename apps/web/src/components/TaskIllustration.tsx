import type { Task } from "@yolo-atlas/core";

/** Small hand-drawn style pictures of each task (two plants on soil). */
export function TaskIllustration({ task }: { task: Task }) {
  const plant = (x: number, y: number, s = 1) => (
    <g transform={`translate(${x} ${y}) scale(${s})`} stroke="var(--stage-neck)" strokeWidth="2" fill="none" strokeLinecap="round">
      <path d="M0 14 V2" />
      <path d="M0 6 C -6 2 -9 -2 -9 -6 C -4 -5 -1 -1 0 4" fill="color-mix(in srgb, var(--stage-neck) 30%, transparent)" />
      <path d="M0 4 C 5 0 9 -3 10 -7 C 5 -6 1 -3 0 2" fill="color-mix(in srgb, var(--stage-neck) 30%, transparent)" />
    </g>
  );
  return (
    <svg viewBox="0 0 120 64" className="h-20 w-full rounded-lg bg-surface-2" role="img" aria-label={`${task} example`}>
      <rect x="0" y="50" width="120" height="14" fill="color-mix(in srgb, var(--stage-head) 25%, transparent)" />
      {plant(35, 38)}
      {plant(82, 36, 1.2)}
      {task === "detect" && (
        <g stroke="var(--stage-postprocess)" strokeWidth="2" fill="none">
          <rect x="22" y="22" width="26" height="32" rx="2" />
          <rect x="66" y="18" width="32" height="38" rx="2" />
        </g>
      )}
      {task === "segment" && (
        <g fill="color-mix(in srgb, var(--stage-postprocess) 35%, transparent)" stroke="var(--stage-postprocess)">
          <path d="M26 31 C 27 26 31 24 35 30 C 40 25 45 25 46 30 C 44 35 39 37 36 36 L 36 52 L 34 52 L 34 37 C 30 38 27 35 26 31 Z" />
          <path d="M71 28 C 73 22 78 21 82 27 C 87 21 93 21 95 27 C 92 33 86 34 83 33 L 83 53 L 81 53 L 81 34 C 76 35 72 32 71 28 Z" />
        </g>
      )}
      {task === "pose" && (
        <g fill="var(--stage-postprocess)">
          {[[35, 52], [35, 40], [26, 32], [44, 31], [82, 53], [82, 40], [71, 30], [94, 28]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.5" />)}
        </g>
      )}
      {task === "classify" && (
        <g>
          <rect x="4" y="4" width="112" height="56" rx="4" fill="none" stroke="var(--stage-postprocess)" strokeWidth="2" />
          <rect x="8" y="8" width="38" height="12" rx="3" fill="var(--stage-postprocess)" />
          <text x="27" y="17" textAnchor="middle" fontSize="8" fill="#fff">weeds</text>
        </g>
      )}
      {task === "obb" && (
        <g stroke="var(--stage-postprocess)" strokeWidth="2" fill="none">
          <rect x="20" y="24" width="30" height="24" rx="2" transform="rotate(-20 35 36)" />
          <rect x="66" y="22" width="34" height="28" rx="2" transform="rotate(25 83 36)" />
        </g>
      )}
    </svg>
  );
}
