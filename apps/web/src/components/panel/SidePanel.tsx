import { useMemo, type ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, X } from "lucide-react";
import {
  explainPosition, formatCount, formatShape, levelLabel, pythonCall, yamlLine,
  type Leveled,
} from "@yolo-atlas/core";
import { useAtlas } from "../../store/atlas";
import { CONTENT, resolveItem } from "../../lib/content";
import { RichText } from "../text/RichText";
import { MathBlock } from "../text/MathBlock";
import { CodeBlock } from "../text/CodeBlock";
import { ReadingLevelSwitch } from "../ReadingLevelSwitch";
import { ParamEditor } from "../lab/ParamEditor";
import { BlockChat } from "../ai/BlockChat";
import { computeArchitecture, diffById } from "@yolo-atlas/core";

function Section({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={`sec-${id}`} className="border-t border-border py-3 first:border-t-0" data-testid={`section-${id}`}>
      <h3 id={`sec-${id}`} className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="space-y-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "ai" | "computed" }) {
  const cls = tone === "ai" ? "bg-warn/15 text-warn" : tone === "computed" ? "bg-accent/10 text-accent" : "bg-surface-2 text-muted";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{children}</span>;
}

export function SidePanel() {
  const { arch: liveArch, computed: liveComp, selectedId: rawId, select, readingLevel: level, mode, original } = useAtlas();
  // removed blocks ("ghosts" in the change view) are explained from the original model
  const ghost = !!rawId?.startsWith("ghost:");
  const origComp = useMemo(() => (original ? computeArchitecture(original) : null), [original]);
  const arch = ghost ? original : liveArch;
  const computed = ghost ? origComp : liveComp;
  const selectedId = ghost ? rawId!.slice(6) : rawId;
  const item = useMemo(() => (arch && selectedId ? resolveItem(arch, selectedId) : null), [arch, selectedId]);
  const pos = useMemo(() => (arch && computed && item?.nodeId ? explainPosition(arch, computed, item.nodeId) : null), [arch, computed, item]);
  const change = useMemo(() => {
    if (!original || !liveArch || !item?.nodeId || !origComp || !liveComp) return null;
    return diffById(original, liveArch, origComp, liveComp).find((d) => (d.b ?? d.a)?.id === item.nodeId && d.kind !== "same") ?? null;
  }, [original, liveArch, item, origComp, liveComp]);
  if (!arch || !computed || !selectedId || !item) return null;
  const content = item.contentId ? CONTENT.get(item.contentId) : undefined;
  const node = item.nodeId ? arch.nodes.find((n) => n.id === item.nodeId) : undefined;
  const c = node ? computed.nodes[node.id] : undefined;
  const issues = computed.issues.filter((i) => i.nodeId === item.nodeId);
  const seen = new Set<string>();
  const t = (l: Leveled | undefined) => (l ? <p><RichText text={l[level]} seen={seen} /></p> : null);
  const share = c && computed.totals.params ? c.params / computed.totals.params : 0;

  return (
    <aside
      className="fixed inset-x-0 bottom-0 z-30 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-border bg-surface shadow-2xl md:static md:z-auto md:max-h-none md:w-[420px] md:shrink-0 md:rounded-none md:border-l md:border-t-0 md:shadow-none"
      aria-label={`Details: ${item.title}`}
      data-testid="side-panel"
    >
      <header className="sticky top-0 z-10 border-b border-border bg-surface px-4 pb-2 pt-3">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border md:hidden" aria-hidden />
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">
              {c ? `Layer ${c.index}` : item.kind === "stage" ? "Stage" : "Step"}
              {c && levelLabel(c.stride) ? ` · ${levelLabel(c.stride)}` : ""}
              {node ? ` · ${node.stage}` : ""}
            </p>
            <h2 className="truncate text-lg font-semibold" data-testid="panel-title">{item.title}</h2>
          </div>
          <button type="button" onClick={() => select(null)} className="rounded p-1 hover:bg-surface-2" aria-label="Close details"><X size={18} /></button>
        </div>
        <div className="mt-2"><ReadingLevelSwitch /></div>
      </header>

      <div className="px-4 pb-6">
        {mode === "lab" && node && !ghost && <ParamEditor nodeId={node.id} />}
        {change && (
          <Section title={change.kind === "removed" ? "Removed in the Lab" : change.kind === "added" ? "Added in the Lab" : "What changed"} id="changed">
            {(change.b ?? change.a)?.modification?.summary && <p><strong>{(change.b ?? change.a)!.modification!.summary}</strong></p>}
            {change.kind === "removed" && <p>This block was in the original model. It no longer runs; its explanation below describes what it used to do.</p>}
            {change.kind === "added" && <p>This block is not in the official {arch.version} model.</p>}
            {change.changes.length > 0 && (
              <ul className="list-disc pl-5">{change.changes.map((c) => <li key={c} className="font-mono text-xs">{c}</li>)}</ul>
            )}
            <p className="text-xs text-muted">Changes are hypotheses until tested: train with and without them (ablation) on your data.</p>
          </Section>
        )}
        {issues.length > 0 && (
          <div role="alert" className="mt-3 rounded-lg border border-danger/50 bg-danger/10 p-2 text-sm">
            {issues.map((i, k) => <p key={k}><strong>{i.severity === "error" ? "Problem: " : "Note: "}</strong>{i.message}</p>)}
          </div>
        )}

        {item.kind === "stage" && item.stageSummary && <Section title="What is it?" id="what">{t(item.stageSummary)}</Section>}

        {content ? (
          <>
            <Section title="What is it?" id="what">{t(content.whatIsIt)}</Section>
            <Section title="Why is it here?" id="why">
              {t(content.whyExists)}
              {pos && pos.whyHere[level] && (
                <div className="rounded-lg bg-accent/5 p-2">
                  <div className="mb-1"><Badge tone="computed">At this exact position</Badge></div>
                  <p><RichText text={pos.whyHere[level]} seen={seen} /></p>
                </div>
              )}
              {content.typicalPositions && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted">Where it usually appears</summary>
                  {t(content.typicalPositions)}
                </details>
              )}
            </Section>
            <Section title="How does it work inside here?" id="how">
              <ol className="list-decimal space-y-1 pl-5">
                {content.howItWorks[level].map((s, i) => <li key={i}><RichText text={s} seen={seen} /></li>)}
              </ol>
              {content.example && (
                <div className="rounded-lg border border-border p-2">
                  <div className="mb-1"><Badge>Example</Badge></div>
                  {t(content.example)}
                </div>
              )}
              {content.analogy && level !== "engineer" && <p className="italic text-muted">{content.analogy}</p>}
              {level === "engineer" && content.math?.map((m, i) => <MathBlock key={i} tex={m} />)}
              {content.tradeoffs && (
                <div>
                  <p className="font-semibold">Trade-offs</p>
                  {t(content.tradeoffs)}
                </div>
              )}
            </Section>
          </>
        ) : (
          item.kind !== "stage" && (
            <Section title="What is it?" id="what">
              <p className="text-muted">There is no written explanation for this block yet. The numbers and connections below are computed from the model.</p>
            </Section>
          )
        )}

        {pos && (
          <Section title="Connections" id="connections">
            <div>
              <p className="mb-1 flex items-center gap-1 font-semibold"><ArrowDownLeft size={14} aria-hidden /> Comes from</p>
              <ul className="space-y-1">
                {pos.comesFrom.map((cn) => (
                  <li key={cn.nodeId}>
                    <button type="button" onClick={() => select(cn.nodeId)} className="rounded-full border border-border px-2 py-0.5 text-xs hover:border-accent" data-testid={`from-${cn.nodeId}`}>
                      {cn.label} <span className="font-mono text-muted">{cn.shape}</span>
                    </button>
                    <span className="ml-2 text-muted">{cn.story}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 flex items-center gap-1 font-semibold"><ArrowUpRight size={14} aria-hidden /> Goes to</p>
              {pos.goesTo.length ? (
                <ul className="space-y-1">
                  {pos.goesTo.map((cn) => (
                    <li key={cn.nodeId}>
                      <button type="button" onClick={() => select(cn.nodeId)} className="rounded-full border border-border px-2 py-0.5 text-xs hover:border-accent" data-testid={`to-${cn.nodeId}`}>
                        {cn.label} <span className="font-mono text-muted">{cn.shape}</span>
                      </button>
                      <span className="ml-2 text-muted">{cn.story}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">{node?.stage === "head" ? "The predictions leave the network here." : "Nothing reads this output."}</p>
              )}
            </div>
          </Section>
        )}

        {c && pos && (
          <Section title="Numbers" id="numbers">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted">Output shape</dt>
              <dd className="font-mono">{c.outputs ? Object.entries(c.outputs).map(([k, s]) => `${k}: ${formatShape(s)}`).join(", ") : formatShape(c.outShape)}</dd>
              <dt className="text-muted">Parameters</dt><dd>{c.params.toLocaleString()}</dd>
              <dt className="text-muted">FLOPs</dt><dd>{(c.flops / 1e9).toFixed(3)} G</dd>
              {c.nEff !== node?.repeats && <><dt className="text-muted">Repeats</dt><dd>{c.nEff} (YAML {node?.repeats})</dd></>}
            </dl>
            <div aria-label={`Share of all parameters: ${(share * 100).toFixed(1)} percent`}>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-accent" style={{ width: `${Math.max(share * 100, 0.5)}%` }} /></div>
              <p className="mt-1 text-xs text-muted">{(share * 100).toFixed(1)}% of {formatCount(computed.totals.params)} parameters</p>
            </div>
            <p className="text-muted"><RichText text={pos.numbers[level]} seen={seen} /></p>
          </Section>
        )}

        {(node || content?.pytorch) && (
          <Section title="Code" id="code">
            {node && <CodeBlock lang="yaml" label="Ultralytics YAML line" code={yamlLine(arch, node.id)} />}
            {c && <CodeBlock lang="python" label="What parse_model builds" code={pythonCall(node!.module, c.ctorArgs)} />}
            {content?.pytorch && <CodeBlock lang="python" label="PyTorch (simplified from Ultralytics)" code={content.pytorch} />}
          </Section>
        )}

        {content?.references?.length ? (
          <Section title="Read more" id="refs">
            <ul className="list-disc pl-5">
              {content.references.map((r) => <li key={r.url}><a className="text-accent underline" href={r.url} target="_blank" rel="noreferrer">{r.label}</a></li>)}
            </ul>
          </Section>
        ) : null}

        <Section title="Ask about this block" id="ask">
          <BlockChat context={[
            `Model: ${arch.version} ${arch.task} (scale ${arch.config.scale ?? "fixed"}, input ${arch.inputSize}).`,
            `Item: ${item.title}${c ? `, layer ${c.index}, ${node?.stage}, output ${formatShape(c.outShape)}, ${c.params} parameters` : ""}.`,
            node ? `YAML: ${yamlLine(arch, node.id)}` : "",
            pos ? `Inputs: ${pos.comesFrom.map((x) => x.story).join(" ")} Outputs: ${pos.goesTo.map((x) => x.story).join(" ")}` : "",
            content ? `About this block: ${content.whatIsIt.engineer}` : "",
          ].filter(Boolean).join("\n")} />
        </Section>
      </div>
    </aside>
  );
}
