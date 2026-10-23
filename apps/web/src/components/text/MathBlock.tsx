import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

export function MathBlock({ tex }: { tex: string }) {
  const html = useMemo(() => katex.renderToString(tex, { throwOnError: false, displayMode: true, output: "htmlAndMathml" }), [tex]);
  return <div className="overflow-x-auto text-sm" dangerouslySetInnerHTML={{ __html: html }} />;
}
