import { Fragment, useMemo, type ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { GLOSSARY, useContentReady } from "../../lib/content";
import { useAtlas } from "../../store/atlas";
import type { GlossaryTerm } from "@yolo-atlas/core";

/** Everyday words that are glossary entries but would be noisy to underline everywhere. */
const NO_AUTO = new Set(["from", "class", "classes", "box", "boxes", "scale", "key", "keys", "value", "values", "query", "queries", "head", "heads", "config", "train", "map", "edge", "speed", "predict", "loss", "losses", "training", "inference", "model size", "anchor", "pretrained", "mask", "masks", "params", "parameter", "weights"]);

interface Matcher {
  re: RegExp;
  byName: Map<string, GlossaryTerm>;
}

function buildMatcher(): Matcher {
  const byName = new Map<string, GlossaryTerm>();
  for (const t of GLOSSARY) for (const n of [t.term, ...t.aliases]) if (!NO_AUTO.has(n.toLowerCase())) byName.set(n.toLowerCase(), t);
  const names = [...byName.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return { re: new RegExp(`(?<![\\w-])(${names.join("|")})(?![\\w-])`, "gi"), byName };
}

let matcher: Matcher | null = null;
let builtFor = 0;

export function GlossaryTip({ term, children }: { term: GlossaryTerm; children: ReactNode }) {
  const level = useAtlas((s) => s.readingLevel);
  return (
    <Tooltip.Root delayDuration={200}>
      <Tooltip.Trigger asChild>
        <span tabIndex={0} className="cursor-help underline decoration-dotted decoration-muted underline-offset-2" data-glossary={term.term}>
          {children}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content sideOffset={4} className="z-50 max-w-xs rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg shadow-lg">
          <strong className="block">{term.term}</strong>
          {term[level]}
          <Tooltip.Arrow className="fill-[var(--border)]" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Plain text with glossary terms underlined (first mention of each term only) and hover/focus definitions. */
export function RichText({ text, seen }: { text: string; seen?: Set<string> }) {
  const ready = useContentReady((s) => s.ready);
  const parts = useMemo(() => {
    if (!GLOSSARY.length) return [text];
    if (!matcher || builtFor !== GLOSSARY.length) {
      matcher = buildMatcher();
      builtFor = GLOSSARY.length;
    }
    const used = seen ?? new Set<string>();
    const out: (string | { t: GlossaryTerm; s: string })[] = [];
    let last = 0;
    for (const m of text.matchAll(matcher.re)) {
      const t = matcher.byName.get(m[0].toLowerCase());
      if (!t || used.has(t.term)) continue;
      used.add(t.term);
      out.push(text.slice(last, m.index), { t, s: m[0] });
      last = (m.index ?? 0) + m[0].length;
    }
    out.push(text.slice(last));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ready` re-runs this once the glossary arrives
  }, [text, seen, ready]);
  return (
    <>
      {parts.map((p, i) => (typeof p === "string" ? <Fragment key={i}>{p}</Fragment> : <GlossaryTip key={i} term={p.t}>{p.s}</GlossaryTip>))}
    </>
  );
}
