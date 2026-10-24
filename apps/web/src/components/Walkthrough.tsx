import { useEffect, useMemo } from "react";
import { Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { explainPosition, formatShape, getBlock } from "@yolo-atlas/core";
import { useAtlas } from "../store/atlas";
import { useHighlight } from "../store/highlight";
import { useWalkEdges } from "../store/walk";
import { CONTENT, loadContent, useContentReady } from "../lib/content";

/** "Follow the image": walk the tensor through the network one layer at a time. */
export function Walkthrough() {
  useContentReady((s) => s.ready);
  void loadContent();
  const { arch, computed, walk, setWalk, centerOn, readingLevel } = useAtlas();
  const setHighlight = useHighlight((s) => s.setIds);
  const setEdges = useWalkEdges((s) => s.set);
  const steps = useMemo(() => (arch ? ["input", ...arch.nodes.filter((n) => n.origin !== "removed-ghost").map((n) => n.id)] : []), [arch]);
  const id = steps[Math.min(walk.step, steps.length - 1)];

  // highlight the current step and its incoming arrows; pan to it
  useEffect(() => {
    if (!walk.active || !arch || !id) return;
    const node = arch.nodes.find((n) => n.id === id);
    const sources = node ? (node.from.length ? node.from : ["input"]) : [];
    const edgeIds = sources.map((s, k) => `${s}->${id}#${k}`);
    setHighlight(new Set([id, ...sources, ...edgeIds]));
    setEdges(new Set(edgeIds), walk.speed);
    centerOn(id);
  }, [walk.active, walk.speed, id, arch, setHighlight, setEdges, centerOn]);

  useEffect(() => {
    if (!walk.active) {
      setHighlight(null);
      setEdges(new Set(), walk.speed);
    }
  }, [walk.active, walk.speed, setHighlight, setEdges]);

  // clear the highlight when the walkthrough closes (this component unmounts)
  useEffect(() => () => {
    setHighlight(null);
    setEdges(new Set(), 1);
  }, [setHighlight, setEdges]);

  // autoplay
  useEffect(() => {
    if (!walk.active || !walk.playing) return;
    if (walk.step >= steps.length - 1) {
      setWalk({ playing: false });
      return;
    }
    const t = setTimeout(() => setWalk({ step: walk.step + 1 }), walk.speed * 1000);
    return () => clearTimeout(t);
  }, [walk, steps.length, setWalk]);

  if (!walk.active || !arch || !computed || !id) return null;
  const node = arch.nodes.find((n) => n.id === id);
  const c = node ? computed.nodes[node.id] : undefined;
  const def = node ? getBlock(node.module) : undefined;
  const shape = c?.outShape ?? [arch.inputChannels, arch.inputSize, arch.inputSize];
  const now = shape.length === 3 ? `Now the picture is ${shape[0]} channels at ${shape[1]}×${shape[2]}.` : `Now the output is ${formatShape(shape)}.`;
  let story: string;
  if (!node) story = CONTENT.get("input")?.whatIsIt[readingLevel] ?? "";
  else {
    const pos = explainPosition(arch, computed, node.id);
    const first = pos?.whyHere[readingLevel].split(/(?<=\.)\s/)[0];
    story = first || (def ? CONTENT.get(def.id)?.whatIsIt[readingLevel] ?? "" : "");
  }
  return (
    <div className="pointer-events-auto absolute bottom-3 left-1/2 z-20 w-[min(560px,calc(100%-24px))] -translate-x-1/2 rounded-xl border border-border bg-surface p-3 shadow-xl" role="region" aria-label="Follow the image" data-testid="walkthrough">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="text-xs text-muted">Step {walk.step + 1} of {steps.length}{c ? ` · layer ${c.index} ${def?.displayName ?? node?.module}` : " · the image"}</p>
          <p className="font-semibold">{now}</p>
          <p className="text-sm">{story}</p>
        </div>
        <button type="button" onClick={() => setWalk({ active: false, playing: false })} className="rounded p-1 hover:bg-surface-2" aria-label="Stop the walkthrough"><X size={16} /></button>
      </div>
      <div className="mt-2 flex items-center gap-1">
        <button type="button" disabled={walk.step === 0} onClick={() => setWalk({ step: walk.step - 1, playing: false })} className="rounded p-1.5 hover:bg-surface-2 disabled:opacity-40" aria-label="Step back"><SkipBack size={16} /></button>
        <button type="button" onClick={() => setWalk({ playing: !walk.playing, step: walk.step >= steps.length - 1 ? 0 : walk.step })} className="rounded bg-accent p-1.5 text-accent-fg" aria-label={walk.playing ? "Pause" : "Play"}>
          {walk.playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button type="button" disabled={walk.step >= steps.length - 1} onClick={() => setWalk({ step: walk.step + 1, playing: false })} className="rounded p-1.5 hover:bg-surface-2 disabled:opacity-40" aria-label="Step forward" data-testid="walk-next"><SkipForward size={16} /></button>
        <input type="range" min={0} max={steps.length - 1} value={walk.step} onChange={(e) => setWalk({ step: Number(e.target.value), playing: false })} className="mx-2 flex-1" aria-label="Walkthrough position" />
        <label className="flex items-center gap-1 text-xs text-muted">
          Speed
          <select value={walk.speed} onChange={(e) => setWalk({ speed: Number(e.target.value) })} className="rounded border border-border bg-bg px-1 py-0.5">
            <option value={3}>slow</option>
            <option value={1.6}>normal</option>
            <option value={0.8}>fast</option>
          </select>
        </label>
      </div>
    </div>
  );
}
