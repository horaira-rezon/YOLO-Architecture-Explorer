import { parse as parseYaml } from "yaml";
import type { YamlValue } from "../schema";

/** One `[from, repeats, module, args]` row. */
export interface YamlLayer {
  from: number | number[];
  repeats: number;
  module: string;
  args: YamlValue[];
  comment?: string;
}

export interface YamlModel {
  nc: number;
  scales: Record<string, [number, number, number]> | null;
  depthMultiple: number | null;
  widthMultiple: number | null;
  kptShape: [number, number] | null;
  regMax: number | null;
  end2end: boolean | null;
  activation: string | null;
  backbone: YamlLayer[];
  head: YamlLayer[];
  extra: Record<string, unknown>;
}

export class YamlImportError extends Error {
  constructor(message: string, readonly line?: number) {
    super(message);
  }
}

const KNOWN = new Set(["nc", "scales", "depth_multiple", "width_multiple", "kpt_shape", "reg_max", "end2end", "activation", "backbone", "head", "scale"]);

function readRows(text: string, list: unknown, section: string): YamlLayer[] {
  if (!Array.isArray(list)) throw new YamlImportError(`The "${section}" part is missing or is not a list of layers.`);
  // comments after each row (e.g. "# 0-P1/2") are kept for export
  const comments = collectRowComments(text, section);
  return list.map((row, i) => {
    if (!Array.isArray(row) || row.length !== 4)
      throw new YamlImportError(`${section} row ${i + 1} should look like [from, repeats, module, [args]].`);
    const [from, repeats, module, args] = row as [unknown, unknown, unknown, unknown];
    const okFrom = typeof from === "number" || (Array.isArray(from) && from.every((f) => typeof f === "number"));
    if (!okFrom) throw new YamlImportError(`${section} row ${i + 1}: "from" must be a number or a list of numbers.`);
    if (typeof repeats !== "number" || repeats < 1) throw new YamlImportError(`${section} row ${i + 1}: repeats must be a whole number of at least 1.`);
    if (typeof module !== "string") throw new YamlImportError(`${section} row ${i + 1}: the module name must be text.`);
    if (!Array.isArray(args)) throw new YamlImportError(`${section} row ${i + 1}: args must be a list.`);
    return { from: from as number | number[], repeats, module, args: args as YamlValue[], comment: comments[i] };
  });
}

function collectRowComments(text: string, section: string): (string | undefined)[] {
  const lines = text.split(/\r?\n/);
  const out: (string | undefined)[] = [];
  let inSection = false;
  for (const line of lines) {
    if (/^\S/.test(line)) inSection = line.startsWith(`${section}:`);
    else if (inSection && /^\s*-\s*\[/.test(line)) {
      const m = line.match(/\]\s*#\s*(.*)$/);
      out.push(m?.[1]?.trim() || undefined);
    }
  }
  return out;
}

export function parseUltralyticsYaml(text: string): YamlModel {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (e) {
    const err = e as { message?: string; linePos?: { line: number }[] };
    throw new YamlImportError(`This is not valid YAML: ${err.message ?? String(e)}`, err.linePos?.[0]?.line);
  }
  if (!raw || typeof raw !== "object") throw new YamlImportError("The file is empty or is not a YAML mapping.");
  const d = raw as Record<string, unknown>;
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) if (!KNOWN.has(k)) extra[k] = v;
  const kpt = d.kpt_shape;
  return {
    nc: typeof d.nc === "number" ? d.nc : 80,
    scales: (d.scales as YamlModel["scales"]) ?? null,
    depthMultiple: typeof d.depth_multiple === "number" ? d.depth_multiple : null,
    widthMultiple: typeof d.width_multiple === "number" ? d.width_multiple : null,
    kptShape: Array.isArray(kpt) && kpt.length === 2 ? (kpt as [number, number]) : null,
    regMax: typeof d.reg_max === "number" ? d.reg_max : null,
    end2end: typeof d.end2end === "boolean" ? d.end2end : null,
    activation: typeof d.activation === "string" ? d.activation : null,
    backbone: readRows(text, d.backbone, "backbone"),
    head: readRows(text, d.head, "head"),
    extra,
  };
}
