import type { ArchNode, Architecture, Task, Training, Postprocess } from "../schema";
import { getBlock } from "../blocks/registry";
import { parseUltralyticsYaml, type YamlLayer, type YamlModel } from "./yaml";

export interface CompileOptions {
  version: string;
  task: Task;
  scale?: string | null;
  inputSize?: number;
  meta: Architecture["meta"];
  id?: string;
}

/** Turn YAML `from` (relative/absolute indices) into node ids. Layer 0 with -1 reads the image. */
export function resolveFrom(from: number | number[], index: number): string[] {
  const list = Array.isArray(from) ? from : [from];
  return list.flatMap((f) => {
    const abs = f < 0 ? index + f : f;
    if (abs < 0) return [];
    return [`n${abs}`];
  });
}

export function defaultTraining(model: Pick<YamlModel, "regMax" | "end2end">, hasDualHead: boolean, task: Task): Training {
  const regMax = model.regMax ?? 16;
  if (task === "classify") return { losses: [{ id: "cls", kind: "CrossEntropy" }], assigner: "none", extras: [] };
  const losses: Training["losses"] = [
    { id: "cls", kind: "BCE", weight: 0.5 },
    { id: "box", kind: "CIoU", weight: 7.5 },
  ];
  if (regMax > 1) losses.push({ id: "dfl", kind: "DFL", weight: 1.5 });
  if (task === "segment") losses.push({ id: "mask", kind: "MaskBCE" });
  if (task === "pose") losses.push({ id: "pose", kind: "KeypointOKS" }, { id: "kobj", kind: "KeypointVisibilityBCE" });
  if (task === "obb") losses.splice(1, 1, { id: "box", kind: "ProbIoU", weight: 7.5 });
  const e2e = hasDualHead || !!model.end2end;
  return { losses, assigner: e2e ? "TAL (one-to-many) + one-to-one" : "TAL", extras: [] };
}

export function defaultPostprocess(endToEnd: boolean, task: Task): Postprocess {
  return { nms: task === "classify" ? false : !endToEnd, confThreshold: 0.25, iouThreshold: 0.7, maxDet: 300 };
}

function rowToNode(row: YamlLayer, index: number, section: "backbone" | "head"): ArchNode {
  const def = getBlock(row.module);
  return {
    id: `n${index}`,
    module: row.module,
    section,
    stage: section === "backbone" ? "backbone" : def?.isHead ? "head" : "neck",
    args: row.args,
    repeats: row.repeats,
    from: resolveFrom(row.from, index),
    origin: "builtin",
    comment: row.comment,
  };
}

export function compileModel(model: YamlModel, opts: CompileOptions): Architecture {
  const rows: [YamlLayer, "backbone" | "head"][] = [
    ...model.backbone.map((r) => [r, "backbone"] as [YamlLayer, "backbone"]),
    ...model.head.map((r) => [r, "head"] as [YamlLayer, "head"]),
  ];
  const nodes = rows.map(([r, s], i) => rowToNode(r, i, s));
  const scale = opts.scale ?? (model.scales ? Object.keys(model.scales)[0]! : null);
  if (model.scales && scale && !model.scales[scale]) throw new Error(`scale "${scale}" is not defined in this config`);
  const hasDual = nodes.some((n) => n.module === "v10Detect");
  const endToEnd = !!model.end2end || hasDual;
  return {
    id: opts.id ?? `${opts.version}-${opts.task}-${scale ?? "base"}`,
    family: "yolo",
    version: opts.version,
    task: opts.task,
    inputSize: opts.inputSize ?? (opts.task === "classify" ? 224 : 640),
    inputChannels: 3,
    config: {
      nc: model.nc,
      scale,
      scales: model.scales,
      depthMultiple: model.depthMultiple ?? 1,
      widthMultiple: model.widthMultiple ?? 1,
      maxChannels: null,
      regMax: model.regMax,
      end2end: model.end2end,
      kptShape: model.kptShape,
      activation: model.activation,
      extra: model.extra,
    },
    nodes,
    training: defaultTraining(model, hasDual, opts.task),
    postprocess: defaultPostprocess(endToEnd, opts.task),
    meta: opts.meta,
    nextId: nodes.length,
  };
}

export function compileYaml(text: string, opts: CompileOptions): Architecture {
  return compileModel(parseUltralyticsYaml(text), opts);
}
