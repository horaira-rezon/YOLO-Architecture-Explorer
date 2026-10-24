import { X } from "lucide-react";
import { blockGraph, formatCount, formatShape, type IRNode } from "@yolo-atlas/core";
import { useAtlas } from "../../store/atlas";
import { loadContent, useContentReady, CONTENT, innerContentId } from "../../lib/content";
import { RichText } from "../text/RichText";
import { MathBlock } from "../text/MathBlock";
import { CodeBlock } from "../text/CodeBlock";
import { ReadingLevelSwitch } from "../ReadingLevelSwitch";

function findAt(nodes: IRNode[], path: string): IRNode | null {
  const segs = path.split(".");
  let list = nodes;
  for (let i = 0; i < segs.length; i++) {
    // names can themselves contain dots-free ids like "m(2)"; walk one segment at a time
    const n = list.find((x) => x.name === segs[i]);
    if (!n) return null;
    if (i === segs.length - 1) return n;
    if (!n.children) return null;
    list = n.children.nodes;
  }
  return null;
}

/** PyTorch line with the real numbers for a primitive. */
function primitiveCode(n: IRNode): string | null {
  const a = n.attrs ?? {};
  switch (n.type) {
    case "Conv2d":
      return `nn.Conv2d(${a.c1}, ${a.c2}, kernel_size=${a.k}, stride=${a.s}, padding=${a.p}${a.g !== 1 ? `, groups=${a.g}` : ""}${a.d !== 1 ? `, dilation=${a.d}` : ""}, bias=${a.bias ? "True" : "False"})`;
    case "BatchNorm2d":
      return `nn.BatchNorm2d(${a.c})`;
    case "MaxPool2d":
      return `nn.MaxPool2d(kernel_size=${a.k}, stride=${a.s}, padding=${a.p})`;
    case "max_pool2d":
      return `F.max_pool2d(x, ${a.k}, ${a.s}, ${a.p})`;
    case "avg_pool2d":
      return `F.avg_pool2d(x, ${a.k}, ${a.s}, ${a.p}, False, True)`;
    case "Upsample":
      return `nn.Upsample(scale_factor=${a.scale}, mode="${a.mode}")`;
    case "ConvTranspose2d":
      return `nn.ConvTranspose2d(${a.c1}, ${a.c2}, ${a.k}, ${a.s}, 0, bias=True)`;
    case "Linear":
      return `nn.Linear(${a.c1}, ${a.c2})`;
    case "cat":
      return "torch.cat(xs, dim=1)";
    case "split":
      return `x.split(${JSON.stringify(a.sizes)}, dim=${Number(a.dim) + 1})`;
    case "SiLU":
      return "nn.SiLU()";
    case "add":
      return "y = a + b";
    case "matmul":
      return "attn = q.transpose(-2, -1) @ k  # or v @ attn.transpose(-2, -1)";
    case "softmax":
      return "attn = attn.softmax(dim=-1)";
    default:
      return null;
  }
}

export function InsidePanel() {
  useContentReady((s) => s.ready);
  void loadContent();
  const { computed, inside, insideSelect, readingLevel: level, zoomLevel } = useAtlas();
  if (!computed || !inside?.selected) return null;
  const ir = computed.nodes[inside.nodeId]?.ir;
  const n = ir ? findAt(blockGraph(ir).nodes, inside.selected) : null;
  if (!n) return null;
  const cid = innerContentId(n.type);
  const content = cid ? CONTENT.get(cid) : undefined;
  const code = primitiveCode(n);
  const showCode = zoomLevel >= 4 || level === "engineer";
  const seen = new Set<string>();
  return (
    <aside className="fixed inset-x-0 bottom-0 z-30 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-border bg-surface p-4 shadow-2xl md:static md:max-h-none md:w-[400px] md:shrink-0 md:rounded-none md:border-l md:border-t-0 md:shadow-none" aria-label={`Details: ${n.name}`} data-testid="inside-panel">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs text-muted">{inside.selected}</p>
          <h2 className="text-lg font-semibold">{content?.name ?? n.type}</h2>
        </div>
        <button type="button" onClick={() => insideSelect(null)} className="rounded p-1 hover:bg-surface-2" aria-label="Close details"><X size={18} /></button>
      </div>
      <div className="my-2"><ReadingLevelSwitch /></div>
      {content ? (
        <div className="space-y-2 text-sm leading-relaxed">
          <p><RichText text={content.whatIsIt[level]} seen={seen} /></p>
          <p><RichText text={content.whyExists[level]} seen={seen} /></p>
          <ol className="list-decimal space-y-1 pl-5">{content.howItWorks[level].map((s, i) => <li key={i}><RichText text={s} seen={seen} /></li>)}</ol>
        </div>
      ) : (
        <p className="text-sm text-muted">This is a {n.type} step. No separate explanation is written for it yet; its numbers are below.</p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-3 text-sm">
        <dt className="text-muted">Output</dt><dd className="font-mono">{formatShape(n.out)}{n.outs ? ` (+${n.outs.length - 1} more)` : ""}</dd>
        <dt className="text-muted">Parameters</dt><dd>{n.params.toLocaleString()} ({formatCount(n.params)})</dd>
        <dt className="text-muted">FLOPs</dt><dd>{((2 * n.ops) / 1e9).toFixed(4)} G</dd>
        {Object.entries(n.attrs ?? {}).map(([k, v]) => (
          <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="font-mono">{Array.isArray(v) ? v.join(", ") : String(v)}</dd></div>
        ))}
        {n.inactive && <><dt className="text-muted">Runs</dt><dd>training only</dd></>}
      </dl>
      {showCode && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {code && <CodeBlock lang="python" label="PyTorch with these numbers" code={code} />}
          {content?.pytorch && content.pytorch !== code && <CodeBlock lang="python" label="PyTorch" code={content.pytorch} />}
          {content?.math?.map((m, i) => <MathBlock key={i} tex={m} />)}
        </div>
      )}
      {!showCode && <p className="mt-3 text-xs text-muted">Move the zoom slider to L4 (or pick the Engineer level) to see the code and the math.</p>}
    </aside>
  );
}
