import { useEffect, useLayoutEffect, useState } from "react";
import tour from "@yolo-atlas/core/content/tour.json";
import { useAtlas } from "../store/atlas";

interface Step {
  target: string;
  title: string;
  body: { eli5: string; simple: string; engineer: string };
}

const STEPS = tour as Step[];
const KEY = "atlas-tour-done";

export function tourDone(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

export function resetTour(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** First-run guided tour (skippable). Highlights elements marked with data-tour="…". */
export function Tour() {
  const level = useAtlas((s) => s.readingLevel);
  const [i, setI] = useState<number | null>(() => (tourDone() ? null : 0));
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = i == null ? null : STEPS[i];

  useLayoutEffect(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  const finish = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // ignore
    }
    setI(null);
  };
  useEffect(() => {
    if (i == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i]);

  if (!step || i == null) return null;
  const pad = 6;
  const below = rect ? rect.bottom + 180 < window.innerHeight : true;
  const left = rect ? Math.min(Math.max(12, rect.left), window.innerWidth - 332) : window.innerWidth / 2 - 160;
  const top = rect ? (below ? rect.bottom + 12 : Math.max(12, rect.top - 190)) : window.innerHeight / 3;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="tour-title" data-testid="tour">
      <div className="absolute inset-0 bg-black/40" onClick={finish} aria-hidden />
      {rect && (
        <div className="pointer-events-none absolute rounded-lg ring-4 ring-accent" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + 2 * pad, height: rect.height + 2 * pad, boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)" }} />
      )}
      <div className="absolute w-80 rounded-xl border border-border bg-surface p-4 shadow-2xl" style={{ left, top }}>
        <p className="text-xs text-muted">Step {i + 1} of {STEPS.length}</p>
        <h2 id="tour-title" className="font-semibold">{step.title}</h2>
        <p className="mt-1 text-sm">{step.body[level]}</p>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={finish} className="text-sm text-muted underline" data-testid="tour-skip">Skip tour</button>
          <span className="flex-1" />
          {i > 0 && <button type="button" onClick={() => setI(i - 1)} className="rounded border border-border px-2 py-1 text-sm">Back</button>}
          <button type="button" autoFocus onClick={() => (i + 1 < STEPS.length ? setI(i + 1) : finish())} className="rounded bg-accent px-3 py-1 text-sm text-accent-fg" data-testid="tour-next">
            {i + 1 < STEPS.length ? "Next" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}
