import * as Menu from "@radix-ui/react-dropdown-menu";
import { Download } from "lucide-react";
import { changeReport, customBlocksPython, exportYaml, trainingScript } from "@yolo-atlas/core";
import { useAtlas } from "../../store/atlas";
import { download } from "../../lib/download";

async function exportImage(kind: "png" | "svg", base: string) {
  const el = document.querySelector<HTMLElement>(".react-flow__viewport");
  if (!el) return;
  const { toPng, toSvg } = await import("html-to-image");
  const bg = getComputedStyle(document.body).backgroundColor;
  const data = await (kind === "png" ? toPng : toSvg)(el, { backgroundColor: bg, pixelRatio: 2 });
  const a = document.createElement("a");
  a.href = data;
  a.download = `${base}.${kind}`;
  a.click();
}

export function ExportMenu() {
  const { arch, original, aiSession } = useAtlas();
  const notes = Object.fromEntries(Object.entries(aiSession?.notes ?? {}).map(([k, o]) => [k, { rationale: `${o.rationaleSimple} ${o.rationaleForGoal}`, tradeoff: `${o.tradeoff} Risk: ${o.risk}` }]));
  if (!arch) return null;
  const base = `yolo-atlas-${arch.version}-${arch.task}-${arch.config.scale ?? "custom"}`;
  const item = "cursor-pointer rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-2";
  return (
    <Menu.Root>
      <Menu.Trigger className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-surface-2" data-testid="export-menu"><Download size={14} /> Export</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content sideOffset={4} align="end" className="z-50 min-w-56 rounded-lg border border-border bg-surface p-1 shadow-xl">
          <Menu.Item className={item} data-testid="export-yaml" onSelect={() => download(`${base}.yaml`, exportYaml(arch, { header: `Exported from YOLO Atlas — ${arch.version} ${arch.task}\nBased on ${arch.meta.source.repo} ${arch.meta.source.file}` }), "text/yaml")}>Ultralytics YAML</Menu.Item>
          <Menu.Item className={item} onSelect={() => download(`${base}.json`, JSON.stringify(arch, null, 2), "application/json")}>Full graph (JSON)</Menu.Item>
          <Menu.Item className={item} onSelect={() => void exportImage("png", base)}>Diagram as PNG</Menu.Item>
          <Menu.Item className={item} onSelect={() => void exportImage("svg", base)}>Diagram as SVG</Menu.Item>
          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Item className={item} onSelect={() => original && download(`${base}-changes.md`, changeReport(original, arch, notes, aiSession?.goal.goal), "text/markdown")}>Change report (Markdown)</Menu.Item>
          <Menu.Item className={item} onSelect={() => download("custom_blocks.py", customBlocksPython(arch), "text/x-python")}>Custom blocks + parse_model edits (.py)</Menu.Item>
          <Menu.Item className={item} onSelect={() => download("train.py", trainingScript(arch, `${base}.yaml`), "text/x-python")}>Training script (.py)</Menu.Item>
          <p className="px-2 py-1 text-[11px] text-muted">After structural edits, pretrained weights only partly transfer.</p>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
