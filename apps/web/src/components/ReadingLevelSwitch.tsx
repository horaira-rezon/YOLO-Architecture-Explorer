import { useAtlas, type ReadingLevel } from "../store/atlas";

export const LEVEL_LABEL: Record<ReadingLevel, string> = { eli5: "Like I'm 5", simple: "Simple", engineer: "Engineer" };

export function ReadingLevelSwitch({ compact = false }: { compact?: boolean }) {
  const level = useAtlas((s) => s.readingLevel);
  const set = useAtlas((s) => s.setReadingLevel);
  return (
    <div role="radiogroup" aria-label="Reading level" className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5 text-xs">
      {(Object.keys(LEVEL_LABEL) as ReadingLevel[]).map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={level === l}
          data-testid={`level-${l}`}
          onClick={() => set(l)}
          className={`rounded-md px-2 py-1 ${level === l ? "bg-surface font-semibold shadow-sm" : "text-muted hover:text-fg"}`}
        >
          {compact && l === "eli5" ? "ELI5" : LEVEL_LABEL[l]}
        </button>
      ))}
    </div>
  );
}
