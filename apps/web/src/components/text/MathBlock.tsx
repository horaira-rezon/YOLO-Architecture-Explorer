import { useEffect, useState } from "react";

let katexP: Promise<typeof import("katex")> | null = null;
const loadKatex = () => {
  // KaTeX (and its CSS) is only needed at the Engineer level / L4
  katexP ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(([k]) => k);
  return katexP;
};

export function MathBlock({ tex }: { tex: string }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void loadKatex().then((k) => alive && setHtml(k.default.renderToString(tex, { throwOnError: false, displayMode: true, output: "htmlAndMathml" })));
    return () => {
      alive = false;
    };
  }, [tex]);
  return html ? <div className="overflow-x-auto text-sm" dangerouslySetInnerHTML={{ __html: html }} /> : <code className="block overflow-x-auto text-xs">{tex}</code>;
}
