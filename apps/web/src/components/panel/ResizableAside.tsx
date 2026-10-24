import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

const MIN = 320;
const KEY = "atlas-panel-width";

interface PanelSize {
  expanded: boolean;
  toggle(): void;
}

const Ctx = createContext<PanelSize>({ expanded: false, toggle: () => undefined });

const maxWidth = () => Math.max(MIN, Math.round(window.innerWidth * 0.75));

function readWidth(fallback: number): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v >= MIN ? v : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Right-hand panel (bottom sheet on phones) that can be resized by dragging its left edge or with the
 * arrow keys on that edge, and expanded/shrunk with a header button. The chosen width is remembered.
 */
export function ResizableAside({ label, testId, defaultWidth = 420, children }: { label: string; testId?: string; defaultWidth?: number; children: ReactNode }) {
  const [width, setWidth] = useState(() => readWidth(defaultWidth));
  const [expanded, setExpanded] = useState(false);
  const drag = useRef<{ x: number; w: number } | null>(null);
  const shown = expanded ? maxWidth() : Math.min(width, maxWidth());

  useEffect(() => {
    try {
      localStorage.setItem(KEY, String(width));
    } catch {
      // preference only
    }
  }, [width]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      setExpanded(false);
      setWidth(Math.min(maxWidth(), Math.max(MIN, drag.current.w + (drag.current.x - e.clientX))));
    };
    const up = () => {
      drag.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  return (
    <Ctx.Provider value={{ expanded, toggle: () => setExpanded((v) => !v) }}>
      <div
        className={`fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border-t border-border bg-surface shadow-2xl md:relative md:inset-auto md:z-auto md:h-auto md:max-h-none md:w-[var(--panel-w)] md:shrink-0 md:rounded-none md:border-l md:border-t-0 md:shadow-none ${expanded ? "max-h-[95vh]" : "max-h-[70vh]"}`}
        style={{ ["--panel-w" as string]: `${shown}px` }}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the panel (arrow keys, double-click to expand)"
          aria-valuemin={MIN}
          aria-valuemax={maxWidth()}
          aria-valuenow={shown}
          tabIndex={0}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, w: shown };
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
          }}
          onDoubleClick={() => setExpanded((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              setExpanded(false);
              setWidth((w) => Math.min(maxWidth(), Math.max(MIN, w + (e.key === "ArrowLeft" ? 40 : -40))));
            }
          }}
          className="group absolute -left-1 top-0 z-20 hidden h-full w-2.5 cursor-col-resize md:block"
          data-testid="panel-resize"
        >
          <span className="mx-auto block h-full w-0.5 transition-colors group-hover:bg-accent group-focus-visible:bg-accent" />
        </div>
        <aside className="min-h-0 flex-1 overflow-y-auto" aria-label={label} data-testid={testId}>
          {children}
        </aside>
      </div>
    </Ctx.Provider>
  );
}

/** Header button that widens the panel (or the sheet on phones) and back. */
export function ExpandButton() {
  const { expanded, toggle } = useContext(Ctx);
  return (
    <button type="button" onClick={toggle} className="rounded p-1 hover:bg-surface-2" aria-label={expanded ? "Make the panel narrower" : "Expand the panel"} aria-pressed={expanded} title={expanded ? "Shrink" : "Expand"} data-testid="panel-expand">
      {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
    </button>
  );
}
