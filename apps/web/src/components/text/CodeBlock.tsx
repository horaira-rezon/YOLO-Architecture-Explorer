import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

type Highlighter = (code: string, lang: string) => Promise<string>;
let highlighter: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  // Shiki is large: load it only when code is first shown
  highlighter ??= import("shiki").then(({ codeToHtml }) => (code: string, lang: string) =>
    codeToHtml(code, { lang, themes: { light: "github-light", dark: "github-dark" }, defaultColor: false }));
  return highlighter;
}

export function CodeBlock({ code, lang, label }: { code: string; lang: "python" | "yaml"; label: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    getHighlighter().then((h) => h(code, lang)).then((r) => alive && setHtml(r)).catch(() => alive && setHtml(null));
    return () => {
      alive = false;
    };
  }, [code, lang]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <figure className="relative rounded-lg border border-border bg-surface-2 text-xs">
      <figcaption className="flex items-center justify-between border-b border-border px-2 py-1 text-muted">
        {label}
        <button type="button" onClick={copy} className="rounded p-1 hover:bg-surface" aria-label={`Copy ${label}`}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </figcaption>
      {html ? (
        <div className="shiki-wrap overflow-x-auto p-2 [&_pre]:!bg-transparent" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="overflow-x-auto p-2 font-mono">{code}</pre>
      )}
    </figure>
  );
}
