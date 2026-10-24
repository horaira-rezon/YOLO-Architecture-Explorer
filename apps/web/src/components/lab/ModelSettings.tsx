import { useState } from "react";
import { allBlocks, type LossItem } from "@yolo-atlas/core";
import { useAtlas } from "../../store/atlas";
import { applyOps } from "../../store/lab";

/** Whole-model controls: size, multipliers, input size, classes, head, P2/P5, losses, assigner, post-processing. */
export function ModelSettings() {
  const { arch } = useAtlas();
  const [inputSize, setInputSize] = useState<number | null>(null);
  if (!arch) return null;
  const c = arch.config;
  const row = c.scales && c.scale ? c.scales[c.scale] : [c.depthMultiple, c.widthMultiple, Infinity];
  const heads = allBlocks().filter((b) => b.isHead && (arch.config.codebase === "yolov13" ? b.id === "Detect" : true));
  const lossOptions = ["BCE", "CIoU", "DFL", "L1", "ProbIoU", "MaskBCE", "KeypointOKS", "KeypointVisibilityBCE", "RLE", "Angle", "SemanticSeg", "CrossEntropy"];
  const setLosses = (losses: LossItem[]) => applyOps([{ op: "changeLoss", losses }], "Change losses");
  return (
    <section className="space-y-3 p-4 text-sm" aria-label="Whole-model settings" data-testid="model-settings">
      <h2 className="text-lg font-semibold">Whole model</h2>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-muted">Size (scale)</span>
          <select value={c.scale ?? ""} onChange={(e) => applyOps([{ op: "changeScale", scale: e.target.value || null }], "Change scale")} className="mt-0.5 w-full rounded border border-border bg-bg px-2 py-1" disabled={!c.scales}>
            {c.scales ? Object.keys(c.scales).map((s) => <option key={s}>{s}</option>) : <option value="">fixed</option>}
          </select>
        </label>
        <label className="block">
          <span className="text-muted">Classes (nc)</span>
          <input type="number" min={1} defaultValue={c.nc} key={c.nc} onBlur={(e) => Number(e.target.value) !== c.nc && applyOps([{ op: "changeNc", nc: Number(e.target.value) }], "Change number of classes")} className="mt-0.5 w-full rounded border border-border bg-bg px-2 py-1" aria-label="Number of classes" data-testid="nc-input" />
        </label>
        <label className="block">
          <span className="text-muted">Depth multiple</span>
          <input type="number" step={0.01} min={0.1} max={2} defaultValue={row?.[0]} key={`d${row?.[0]}`} onBlur={(e) => applyOps([{ op: "changeScale", scale: c.scale, depthMultiple: Number(e.target.value) }], "Custom depth")} className="mt-0.5 w-full rounded border border-border bg-bg px-2 py-1" />
        </label>
        <label className="block">
          <span className="text-muted">Width multiple</span>
          <input type="number" step={0.01} min={0.1} max={2} defaultValue={row?.[1]} key={`w${row?.[1]}`} onBlur={(e) => applyOps([{ op: "changeScale", scale: c.scale, widthMultiple: Number(e.target.value) }], "Custom width")} className="mt-0.5 w-full rounded border border-border bg-bg px-2 py-1" />
        </label>
        <label className="col-span-2 block">
          <span className="text-muted">Input size (multiple of 32)</span>
          <div className="mt-0.5 flex gap-2">
            <input type="number" step={32} min={64} max={4096} value={inputSize ?? arch.inputSize} onChange={(e) => setInputSize(Number(e.target.value))} className="w-28 rounded border border-border bg-bg px-2 py-1" aria-label="Input size" />
            <button type="button" className="rounded border border-border px-2" onClick={() => inputSize && applyOps([{ op: "changeInputSize", inputSize }], `Input size ${inputSize}`)}>Apply</button>
          </div>
        </label>
      </div>

      <div>
        <p className="font-semibold">Detection levels</p>
        <div className="mt-1 flex flex-wrap gap-2">
          <button type="button" onClick={() => applyOps([{ op: "addHeadLevel", level: "P2" }], "Add P2 level", { summary: "Added a P2 (stride 4) detection level for tiny objects" })} className="rounded border border-border px-2 py-1 hover:bg-surface-2" data-testid="add-p2">Add P2 small-object level</button>
          <button type="button" onClick={() => applyOps([{ op: "removeHeadLevel", level: "P5" }], "Remove P5 level", { summary: "Removed the P5 (large objects) level" })} className="rounded border border-border px-2 py-1 hover:bg-surface-2">Remove P5 level</button>
        </div>
      </div>

      <label className="block">
        <span className="text-muted">Head type</span>
        <select value={arch.nodes[arch.nodes.length - 1]?.module} onChange={(e) => applyOps([{ op: "changeHead", module: e.target.value }], "Change head")} className="mt-0.5 w-full rounded border border-border bg-bg px-2 py-1">
          {heads.map((h) => <option key={h.id} value={h.yamlName}>{h.displayName}</option>)}
        </select>
        <span className="text-xs text-muted">Changing the head changes the task the model is trained for.</span>
      </label>

      <div>
        <p className="font-semibold">Training (does not change the network)</p>
        <ul className="mt-1 space-y-1">
          {arch.training.losses.map((l, i) => (
            <li key={l.id} className="flex items-center gap-2">
              <select value={l.kind} onChange={(e) => setLosses(arch.training.losses.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))} className="flex-1 rounded border border-border bg-bg px-1 py-0.5" aria-label={`Loss ${i + 1}`}>
                {[...new Set([l.kind, ...lossOptions])].map((o) => <option key={o}>{o}</option>)}
              </select>
              <input type="number" step={0.1} defaultValue={l.weight} placeholder="gain" onBlur={(e) => setLosses(arch.training.losses.map((x, j) => (j === i ? { ...x, weight: e.target.value === "" ? undefined : Number(e.target.value) } : x)))} className="w-16 rounded border border-border bg-bg px-1 py-0.5 text-right" aria-label={`Loss ${i + 1} gain`} />
              <button type="button" onClick={() => setLosses(arch.training.losses.filter((_, j) => j !== i))} className="text-xs text-danger" aria-label={`Remove loss ${l.kind}`}>remove</button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setLosses([...arch.training.losses, { id: `l${Date.now()}`, kind: "CIoU", weight: 1 }])} className="mt-1 text-xs text-accent underline">+ add loss</button>
        <label className="mt-2 block">
          <span className="text-muted">Assigner</span>
          <select value={arch.training.assigner} onChange={(e) => applyOps([{ op: "changeAssigner", assigner: e.target.value }], "Change assigner")} className="mt-0.5 w-full rounded border border-border bg-bg px-2 py-1">
            {[...new Set([arch.training.assigner, "TAL", "TAL (one-to-many) + one-to-one", "TAL with STAL (one-to-many) + one-to-one"])].map((a) => <option key={a}>{a}</option>)}
          </select>
        </label>
      </div>

      <div>
        <p className="font-semibold">After the model</p>
        <label className="mt-1 flex items-center gap-2">
          <input type="checkbox" checked={arch.postprocess.nms} onChange={(e) => applyOps([{ op: "changePostprocess", postprocess: { nms: e.target.checked } }], "Toggle NMS")} /> Use NMS
        </label>
        {!arch.postprocess.nms && !arch.config.end2end && !arch.nodes.some((n) => n.module === "v10Detect") && (
          <p className="text-xs text-warn">This head is not end-to-end; without NMS you will get many duplicate boxes.</p>
        )}
        <div className="mt-1 grid grid-cols-2 gap-2">
          <label>Confidence <input type="number" step={0.05} min={0} max={1} defaultValue={arch.postprocess.confThreshold} onBlur={(e) => applyOps([{ op: "changePostprocess", postprocess: { confThreshold: Number(e.target.value) } }], "Confidence threshold")} className="w-full rounded border border-border bg-bg px-1 py-0.5" /></label>
          <label>NMS IoU <input type="number" step={0.05} min={0} max={1} defaultValue={arch.postprocess.iouThreshold} onBlur={(e) => applyOps([{ op: "changePostprocess", postprocess: { iouThreshold: Number(e.target.value) } }], "NMS IoU threshold")} className="w-full rounded border border-border bg-bg px-1 py-0.5" /></label>
        </div>
      </div>
    </section>
  );
}
