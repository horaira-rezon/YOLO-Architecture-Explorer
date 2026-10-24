import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Trash2 } from "lucide-react";
import { allBlocks, getBlock, type ArgSpec, type YamlValue } from "@yolo-atlas/core";
import { useAtlas } from "../../store/atlas";
import { applyOps } from "../../store/lab";
import { defaultArgs } from "../../lib/labDefaults";

function ArgField({ spec, value, onChange }: { spec: ArgSpec; value: YamlValue | undefined; onChange(v: YamlValue): void }) {
  const id = `arg-${spec.name}`;
  if (spec.kind === "bool")
    return (
      <label className="flex items-center gap-2 text-sm" htmlFor={id}>
        <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} /> {spec.label}
      </label>
    );
  if (spec.kind === "enum")
    return (
      <label className="block text-sm" htmlFor={id}>
        <span className="text-muted">{spec.label}</span>
        <select id={id} value={String(value ?? spec.default ?? "")} onChange={(e) => onChange(/^\d+$/.test(e.target.value) ? Number(e.target.value) : e.target.value)} className="mt-0.5 w-full rounded border border-border bg-bg px-2 py-1">
          {(spec.options ?? []).map((o) => <option key={o}>{o}</option>)}
        </select>
      </label>
    );
  if (spec.kind === "nc" || spec.kind === "kpt" || spec.kind === "none")
    return <p className="text-sm"><span className="text-muted">{spec.label}:</span> <code>{JSON.stringify(value ?? spec.default)}</code></p>;
  if (spec.kind === "intlist")
    return (
      <label className="block text-sm" htmlFor={id}>
        <span className="text-muted">{spec.label}</span>
        <input id={id} defaultValue={JSON.stringify(value ?? spec.default ?? [])} onBlur={(e) => { try { onChange(JSON.parse(e.target.value) as YamlValue); } catch { /* keep old value */ } }} className="mt-0.5 w-full rounded border border-border bg-bg px-2 py-1 font-mono" />
      </label>
    );
  const n = typeof value === "number" ? value : typeof spec.default === "number" ? spec.default : 0;
  const slider = spec.kind === "channels" || (spec.min !== undefined && spec.max !== undefined);
  return (
    <label className="block text-sm" htmlFor={id}>
      <span className="flex justify-between text-muted">{spec.label}<span className="font-mono text-fg">{value === null ? "auto" : n}</span></span>
      <div className="mt-0.5 flex items-center gap-2">
        {slider && <input type="range" aria-label={`${spec.label} slider`} min={spec.min ?? 8} max={spec.max ?? 2048} step={spec.step ?? (spec.kind === "float" ? 0.05 : 1)} value={n} onChange={(e) => onChange(Number(e.target.value))} className="flex-1" />}
        <input id={id} type="number" value={value === null ? "" : n} placeholder="auto" step={spec.step ?? (spec.kind === "float" ? 0.05 : 1)} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} className="w-20 rounded border border-border bg-bg px-1 py-0.5 text-right font-mono" />
      </div>
    </label>
  );
}

/** Lab: edit a layer's settings, inputs, block type and position. */
export function ParamEditor({ nodeId }: { nodeId: string }) {
  const { arch, computed } = useAtlas();
  const node = arch?.nodes.find((n) => n.id === nodeId);
  const def = node ? getBlock(node.module) : undefined;
  const [args, setArgs] = useState<YamlValue[]>([]);
  const [repeats, setRepeats] = useState(1);
  useEffect(() => {
    if (node) {
      setArgs(node.args);
      setRepeats(node.repeats);
    }
  }, [node]);
  const index = arch?.nodes.findIndex((n) => n.id === nodeId) ?? -1;
  const earlier = useMemo(() => (arch ? arch.nodes.slice(0, index) : []), [arch, index]);
  const replaceable = useMemo(() => allBlocks().filter((b) => def && !b.isHead === !def.isHead && b.inputs.min <= (node?.from.length || 1) && b.inputs.max >= (node?.from.length || 1) && b.id !== def.id), [def, node]);
  if (!arch || !node || !def) return null;
  const dirty = JSON.stringify(args) !== JSON.stringify(node.args) || repeats !== node.repeats;
  const c = computed?.nodes[node.id];
  return (
    <section className="space-y-2 border-b border-border py-3" aria-label="Edit this layer" data-testid="param-editor">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Edit this layer</h3>
      {def.args.map((spec, i) => (
        <ArgField key={spec.name} spec={spec} value={args[i]} onChange={(v) => setArgs((a) => { const n = [...a]; while (n.length < i) n.push(null); n[i] = v; return n; })} />
      ))}
      <label className="block text-sm">
        <span className="flex justify-between text-muted">Repeats (YAML n){c && c.nEff !== repeats && <span>→ {c.nEff} after depth</span>}</span>
        <input type="number" min={1} max={12} value={repeats} onChange={(e) => setRepeats(Math.max(1, Number(e.target.value)))} className="mt-0.5 w-20 rounded border border-border bg-bg px-1 py-0.5 text-right font-mono" aria-label="Repeats" />
      </label>
      <div className="flex gap-2">
        <button type="button" disabled={!dirty} onClick={() => applyOps([{ op: "updateArgs", nodeId, args, repeats }], `Edit layer ${c?.index}`)} className="rounded bg-accent px-3 py-1 text-sm text-accent-fg disabled:opacity-40" data-testid="apply-args">Apply</button>
        <button type="button" disabled={!dirty} onClick={() => { setArgs(node.args); setRepeats(node.repeats); }} className="rounded border border-border px-3 py-1 text-sm disabled:opacity-40">Undo changes</button>
      </div>

      <fieldset className="text-sm">
        <legend className="text-muted">Inputs (reads from)</legend>
        <div className="mt-1 flex flex-wrap gap-1">
          {node.from.map((f, k) => (
            <select key={k} aria-label={`Input ${k + 1}`} value={f} onChange={(e) => applyOps([{ op: "rewire", nodeId, from: node.from.map((x, j) => (j === k ? e.target.value : x)) }], "Rewire")} className="rounded border border-border bg-bg px-1 py-0.5 text-xs">
              {earlier.map((n) => <option key={n.id} value={n.id}>{computed?.nodes[n.id]?.index} {getBlock(n.module)?.displayName ?? n.module}</option>)}
            </select>
          ))}
          {node.from.length < def.inputs.max && earlier.length > 0 && (
            <button type="button" className="rounded border border-dashed border-border px-2 py-0.5 text-xs" onClick={() => applyOps([{ op: "rewire", nodeId, from: [...node.from, earlier[earlier.length - 1]!.id] }], "Add input")}>+ input</button>
          )}
          {node.from.length > def.inputs.min && (
            <button type="button" className="rounded border border-dashed border-border px-2 py-0.5 text-xs" onClick={() => applyOps([{ op: "rewire", nodeId, from: node.from.slice(0, -1) }], "Remove input")}>− input</button>
          )}
        </div>
      </fieldset>

      <label className="block text-sm">
        <span className="text-muted">Replace with</span>
        <select value="" onChange={(e) => { const b = getBlock(e.target.value); if (b) applyOps([{ op: "replaceNode", nodeId, module: b.yamlName, args: defaultArgs(b, node, computed) }], `Replace with ${b.displayName}`); }} className="mt-0.5 w-full rounded border border-border bg-bg px-2 py-1" aria-label="Replace with another block" data-testid="replace-select">
          <option value="">Choose a block…</option>
          {replaceable.map((b) => <option key={b.id} value={b.id}>{b.displayName}{b.extra ? " (extra)" : ""}</option>)}
        </select>
      </label>

      <div className="flex flex-wrap gap-1 pt-1">
        <button type="button" disabled={index <= 0} onClick={() => arch.nodes[index - 2] && applyOps([{ op: "moveNode", nodeId, after: arch.nodes[index - 2]!.id }], "Move up")} className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs disabled:opacity-40" title="Move one position earlier"><ArrowUp size={12} /> Up</button>
        <button type="button" disabled={index >= arch.nodes.length - 2} onClick={() => applyOps([{ op: "moveNode", nodeId, after: arch.nodes[index + 1]!.id }], "Move down")} className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs disabled:opacity-40"><ArrowDown size={12} /> Down</button>
        <button type="button" disabled={def.isHead} onClick={() => applyOps([{ op: "duplicateNodes", nodeIds: [nodeId] }], "Duplicate")} className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs disabled:opacity-40"><Copy size={12} /> Duplicate</button>
        <button type="button" disabled={def.isHead} onClick={() => { applyOps([{ op: "deleteNode", nodeId, mode: "bridge" }], "Delete (bridge)"); useAtlas.getState().select(null); }} className="flex items-center gap-1 rounded border border-danger/60 px-2 py-1 text-xs text-danger disabled:opacity-40" title="Delete and connect its input straight to its outputs" data-testid="delete-bridge"><Trash2 size={12} /> Delete (bridge over)</button>
        <button type="button" disabled={def.isHead} onClick={() => { applyOps([{ op: "deleteNode", nodeId, mode: "dangling" }], "Delete (dangling)"); useAtlas.getState().select(null); }} className="flex items-center gap-1 rounded border border-danger/60 px-2 py-1 text-xs text-danger disabled:opacity-40" title="Delete and leave the following blocks without this input" data-testid="delete-dangling"><Trash2 size={12} /> Delete (leave dangling)</button>
      </div>
    </section>
  );
}
