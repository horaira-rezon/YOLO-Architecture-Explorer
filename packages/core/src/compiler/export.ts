import type { Architecture, YamlValue } from "../schema";

const VAR_NAMES = new Set(["nc", "kpt_shape", "reg_max"]);

export function formatYamlValue(v: YamlValue): string {
  if (v === null) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "None";
  if (Array.isArray(v)) return `[${v.map(formatYamlValue).join(", ")}]`;
  if (VAR_NAMES.has(v) || v === "None") return v;
  return JSON.stringify(v);
}

function formatFrom(from: string[], index: number, idx: Record<string, number>): string {
  if (from.length === 0) return "-1";
  const parts = from.map((id) => {
    const j = idx[id];
    if (j === undefined) throw new Error(`layer ${index} reads from unknown node ${id}`);
    return j === index - 1 ? -1 : j;
  });
  return parts.length === 1 ? String(parts[0]) : `[${parts.join(", ")}]`;
}

function stripIndex(comment: string | undefined): string {
  return (comment ?? "").replace(/^\d+\s*-?\s*/, "").trim();
}

/** Ultralytics-compatible YAML. Indices are renumbered from the current node order. */
export function exportYaml(arch: Architecture, opts: { header?: string } = {}): string {
  const idx: Record<string, number> = {};
  const live = arch.nodes.filter((n) => n.origin !== "removed-ghost");
  live.forEach((n, i) => (idx[n.id] = i));
  const c = arch.config;
  const out: string[] = [];
  if (opts.header) out.push(...opts.header.split("\n").map((l) => `# ${l}`), "");
  out.push(`nc: ${c.nc} # number of classes`);
  if (c.kptShape) out.push(`kpt_shape: ${formatYamlValue(c.kptShape)} # number of keypoints, number of dims`);
  if (c.end2end != null) out.push(`end2end: ${formatYamlValue(c.end2end)}`);
  if (c.regMax != null) out.push(`reg_max: ${c.regMax}`);
  if (c.activation) out.push(`activation: ${c.activation}`);
  for (const [k, v] of Object.entries(c.extra)) out.push(`${k}: ${JSON.stringify(v)}`);
  if (c.scales) {
    out.push("scales: # [depth, width, max_channels]");
    for (const [k, row] of Object.entries(c.scales)) out.push(`  ${k}: [${row.join(", ")}]`);
  } else {
    out.push(`depth_multiple: ${c.depthMultiple}`, `width_multiple: ${c.widthMultiple}`);
  }
  const firstHead = live.findIndex((n) => n.section === "head");
  const split = firstHead < 0 ? live.length : firstHead;
  const row = (n: Architecture["nodes"][number], i: number) => {
    const rest = stripIndex(n.comment);
    return `  - [${formatFrom(n.from, i, idx)}, ${n.repeats}, ${n.module}, ${formatYamlValue(n.args)}] # ${i}${rest ? ` ${rest}` : ""}`;
  };
  out.push("", "backbone:", "  # [from, repeats, module, args]");
  live.slice(0, split).forEach((n, i) => out.push(row(n, i)));
  out.push("", "head:");
  live.slice(split).forEach((n, k) => out.push(row(n, split + k)));
  return out.join("\n") + "\n";
}

/** The YAML row of one node, as it would appear in an export (`- [from, n, module, args] # i`). */
export function yamlLine(arch: Architecture, nodeId: string): string {
  const live = arch.nodes.filter((n) => n.origin !== "removed-ghost");
  const idx: Record<string, number> = {};
  live.forEach((n, i) => (idx[n.id] = i));
  const i = idx[nodeId];
  const n = live[i ?? -1];
  if (!n || i === undefined) return "";
  return `- [${formatFrom(n.from, i, idx)}, ${n.repeats}, ${n.module}, ${formatYamlValue(n.args)}] # ${i}`;
}

/** Python constructor call with parse_model's resolved args, e.g. `C2f(64, 64, 2, True)`. */
export function pythonCall(module: string, ctorArgs: YamlValue[]): string {
  const name = module.replace(/^nn\./, "nn.");
  const fmt = (v: YamlValue): string =>
    v === null ? "None" : typeof v === "boolean" ? (v ? "True" : "False") : Array.isArray(v) ? `[${v.map(fmt).join(", ")}]` : typeof v === "string" ? JSON.stringify(v) : String(v);
  return `${name}(${ctorArgs.map(fmt).join(", ")})`;
}
