import { create } from "zustand";
import { getBlock, innerContentCandidates, type Architecture, type BlockContent, type GlossaryTerm, type Leveled } from "@yolo-atlas/core";
import { STAGE_CONTENT } from "./stages";

/** Filled by loadContent(); components re-render via useContentReady. */
export const CONTENT = new Map<string, BlockContent>();
export const GLOSSARY: GlossaryTerm[] = [];

export const useContentReady = create<{ ready: boolean }>(() => ({ ready: false }));

let loading: Promise<void> | null = null;
/** Load all explanations (one chunk). Called after the first paint and whenever a panel needs it. */
export function loadContent(): Promise<void> {
  loading ??= import("./contentBundle").then(({ parseAll }) => {
    const { content, glossary } = parseAll();
    for (const [k, v] of content) CONTENT.set(k, v);
    GLOSSARY.push(...glossary);
    useContentReady.setState({ ready: true });
  });
  return loading;
}

export interface ItemRef {
  kind: "layer" | "item" | "stage";
  /** Content id (block id or item id). */
  contentId: string | null;
  title: string;
  nodeId?: string;
  stageSummary?: Leveled;
}

/** What a selected id on the canvas refers to, and which content explains it. */
export function resolveItem(arch: Architecture, id: string): ItemRef | null {
  if (id.startsWith("stage:")) {
    const s = id.slice(6) as keyof typeof STAGE_CONTENT;
    const sc = STAGE_CONTENT[s];
    return sc ? { kind: "stage", contentId: null, title: sc.title, stageSummary: sc.summary } : null;
  }
  if (id === "input") return { kind: "item", contentId: "input", title: "Input image" };
  if (id === "post:conf") return { kind: "item", contentId: "post-conf", title: "Confidence filter" };
  if (id === "post:nms") return arch.postprocess.nms ? { kind: "item", contentId: "post-nms", title: "NMS" } : { kind: "item", contentId: "post-e2e", title: "No NMS (end-to-end)" };
  if (id === "post:softmax") return { kind: "item", contentId: "post-softmax", title: "Softmax" };
  if (id === "train:assigner") {
    const dual = /one-to-one/.test(arch.training.assigner);
    return { kind: "item", contentId: dual ? "assigner-dual" : "assigner-TAL", title: arch.training.assigner };
  }
  if (id.startsWith("train:extra:")) {
    const x = id.slice(12);
    return { kind: "item", contentId: `extra-${x}`, title: CONTENT.get(`extra-${x}`)?.name ?? x };
  }
  if (id.startsWith("train:loss:")) {
    const loss = arch.training.losses.find((l) => `train:loss:${l.id}` === id);
    return loss ? { kind: "item", contentId: `loss-${loss.kind}`, title: `${loss.kind} loss` } : null;
  }
  const node = arch.nodes.find((n) => n.id === id);
  if (!node) return null;
  const def = getBlock(node.module);
  return { kind: "layer", contentId: def?.id ?? null, title: def?.displayName ?? node.module, nodeId: node.id };
}


/** Content id for an operation or sub-block seen inside a block (L2/L3). */
export function innerContentId(type: string): string | null {
  return innerContentCandidates(type).find((id) => CONTENT.has(id)) ?? null;
}
