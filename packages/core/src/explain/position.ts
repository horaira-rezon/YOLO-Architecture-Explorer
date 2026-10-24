import templates from "../../content/templates.json";
import type { Architecture } from "../schema";
import type { ComputeResult } from "../engine/compute";
import { getBlock } from "../blocks/registry";
import { formatCount, formatShape, levelLabel } from "../describe";
import type { Level, Leveled } from "../content/schema";
import { LEVELS } from "../content/schema";

type TemplateKey = Exclude<keyof typeof templates, "objects" | "consumerVerbs" | "sourceKinds">;

function fill(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

function sentence(key: TemplateKey, vars: Record<string, string | number>): Leveled {
  const t = templates[key] as Leveled;
  return { eli5: fill(t.eli5, vars), simple: fill(t.simple, vars), engineer: fill(t.engineer, vars) };
}

function join(parts: Leveled[]): Leveled {
  const out = { eli5: "", simple: "", engineer: "" } as Leveled;
  for (const l of LEVELS) out[l] = parts.map((p) => p[l]).filter(Boolean).join(" ");
  return out;
}

const objectsFor = (stride: number | null) => (stride ? (templates.objects as Record<string, string>)[String(stride)] ?? "differently sized" : "differently sized");

const STAGE_TITLE: Record<string, string> = { backbone: "backbone", neck: "neck", head: "head", input: "input", loss: "training", postprocess: "post-processing" };

export interface Connection {
  nodeId: string;
  index: number;
  label: string;
  shape: string;
  /** One-line story of what is handed over / what happens next. */
  story: string;
}

export interface PositionalExplanation {
  whyHere: Leveled;
  numbers: Leveled;
  comesFrom: Connection[];
  goesTo: Connection[];
}

/** Text about a layer *at its position*, computed from the graph (no AI). */
export function explainPosition(arch: Architecture, comp: ComputeResult, nodeId: string): PositionalExplanation | null {
  const node = arch.nodes.find((n) => n.id === nodeId);
  const c = comp.nodes[nodeId];
  if (!node || !c) return null;
  const def = getBlock(node.module);
  const live = arch.nodes.filter((n) => n.origin !== "removed-ghost");
  const stageNodes = live.filter((n) => n.stage === node.stage);
  const parts: Leveled[] = [];
  const level = levelLabel(c.stride);
  const size = (s: number[] | null | undefined) => (s && s.length === 3 ? `${s[1]}×${s[2]}` : formatShape(s));

  if (stageNodes[0]?.id === node.id && node.stage !== "head") parts.push(sentence("stageFirst", { stage: STAGE_TITLE[node.stage] ?? node.stage }));

  // spatial change
  const inS = c.inShapes[0];
  const out = c.outShape;
  if (inS && out && inS.length === 3 && out.length === 3 && def && !def.isHead) {
    if (out[1]! * 2 === inS[1]) parts.push(sentence("halves", { inSize: size(inS), outSize: size(out), stride: c.stride ?? "" }));
    else if (out[1] === inS[1]! * 2) parts.push(sentence("doubles", { inSize: size(inS), outSize: size(out) }));
    else if (def.id !== "Concat") parts.push(sentence("keepsSize", { outSize: size(out) }));
  }

  // first layer at this pyramid level
  if (c.stride && out?.length === 3) {
    const firstAt = live.find((n) => comp.nodes[n.id]?.stride === c.stride);
    if (firstAt?.id === node.id && c.stride >= 4)
      parts.push(sentence("firstAtLevel", { level: level ?? `stride ${c.stride}`, size: out[1]!, channels: out[0]!, stride: c.stride, objects: objectsFor(c.stride) }));
  }

  // channel change (single-input blocks)
  if (inS && out && def && !def.isHead && def.id !== "Concat" && c.inShapes.length === 1) {
    if (out[0]! > inS[0]!) parts.push(sentence("channelsUp", { inC: inS[0]!, outC: out[0]! }));
    else if (out[0]! < inS[0]!) parts.push(sentence("channelsDown", { inC: inS[0]!, outC: out[0]! }));
  }

  // what a concat joins
  if (def?.id === "Concat") {
    const kinds = templates.sourceKinds as Record<string, string>;
    const srcs = node.from.map((f) => {
      const src = arch.nodes.find((n) => n.id === f);
      const sc = comp.nodes[f];
      const vars = { index: sc?.index ?? "?", level: levelLabel(sc?.stride ?? null) ?? "" };
      const key = src && getBlock(src.module)?.id === "Upsample" ? "upsampled" : src?.stage === "backbone" ? "backbone" : src?.stage === "neck" ? "neck" : "other";
      return fill(kinds[key]!, vars);
    });
    parts.push(sentence("joins", { sources: srcs.join(" and "), outC: out?.[0] ?? "?" }));
  }

  if (def?.isHead) {
    const levels = node.from.map((f) => levelLabel(comp.nodes[f]?.stride ?? null) ?? "?");
    parts.push(sentence("headLevels", { count: levels.length, levels: levels.join(", ") }));
  }

  // repeats
  if (node.repeats > 1) parts.push(sentence("repeats", { n: c.nEff, times: c.nEff === 1 ? "once" : `${c.nEff} times`, yamlN: node.repeats, depth: comp.scaleRow.depth }));

  // consumers: head input, skip links
  const consumers = comp.consumers[nodeId] ?? [];
  const headConsumers = consumers.filter((t) => getBlock(arch.nodes.find((n) => n.id === t)?.module ?? "")?.isHead);
  if (headConsumers.length && level) parts.push(sentence("feedsHead", { level, objects: objectsFor(c.stride) }));
  const later = consumers.filter((t) => (comp.nodes[t]?.index ?? 0) > c.index + 1 && !headConsumers.includes(t));
  if (later.length) parts.push(sentence("reused", { targets: later.map((t) => `layer ${comp.nodes[t]?.index}`).join(", ") }));

  const lastOfStage = stageNodes[stageNodes.length - 1]?.id === node.id;
  if (lastOfStage && node.stage === "backbone") {
    const nextNode = live[live.indexOf(node) + 1];
    parts.push(sentence("stageLast", { stage: "backbone", next: nextNode ? STAGE_TITLE[nextNode.stage] ?? nextNode.stage : "the head" }));
  }

  const pct = comp.totals.params ? `${((100 * c.params) / comp.totals.params).toFixed(1)}%` : "0%";
  const numbers = sentence("share", { params: formatCount(c.params), pct, flops: (c.flops / 1e9).toFixed(2) });

  const verbs = templates.consumerVerbs as Record<string, string>;
  const comesFrom: Connection[] = node.from.length
    ? node.from.map((f) => {
        const src = arch.nodes.find((n) => n.id === f);
        const sc = comp.nodes[f];
        const name = getBlock(src?.module ?? "")?.displayName ?? src?.module ?? f;
        return { nodeId: f, index: sc?.index ?? -1, label: `${sc?.index} ${name}`, shape: formatShape(sc?.outShape), story: `Layer ${sc?.index} (${name}) hands over a ${formatShape(sc?.outShape)} map.` };
      })
    : [{ nodeId: "input", index: -1, label: "Image", shape: formatShape([arch.inputChannels, arch.inputSize, arch.inputSize]), story: `The ${arch.inputSize}×${arch.inputSize} image comes in as 3 colour channels.` }];
  const goesTo: Connection[] = consumers.map((t) => {
    const tn = arch.nodes.find((n) => n.id === t);
    const td = getBlock(tn?.module ?? "");
    const tc = comp.nodes[t];
    const verb = verbs[td?.id ?? ""] ?? verbs.default!;
    return { nodeId: t, index: tc?.index ?? -1, label: `${tc?.index} ${td?.displayName ?? tn?.module}`, shape: formatShape(out), story: `Layer ${tc?.index} (${td?.displayName ?? tn?.module}) ${verb}.` };
  });

  return { whyHere: join(parts), numbers, comesFrom, goesTo };
}

export function pick(l: Leveled, level: Level): string {
  return l[level];
}
