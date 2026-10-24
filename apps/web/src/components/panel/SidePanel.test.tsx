import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import * as Tooltip from "@radix-ui/react-tooltip";
import { compileYaml, type ModelData } from "@yolo-atlas/core";
import { useAtlas } from "../../store/atlas";
import { SidePanel } from "./SidePanel";

const DATA = join(__dirname, "../../../../../packages/core/data/models");
const read = (v: string) => JSON.parse(readFileSync(join(DATA, `${v}.json`), "utf8")) as ModelData;

type T = "detect" | "segment" | "pose" | "classify" | "obb";
function load(task: T, version = "v8") {
  const data = read(version);
  const [scale, v] = Object.entries(data.tasks[task]!.variants)[0]!;
  const arch = compileYaml(v.yamlText, { version, task, scale: /^scales:/m.test(v.yamlText) ? scale : null, inputSize: v.inputSize, meta: { source: v.source, confidence: "verified", retrievedAt: v.retrievedAt, notes: [] } });
  useAtlas.getState().setLoaded(arch, ["n"]);
  return arch;
}

const renderPanel = () => render(<MemoryRouter><Tooltip.Provider><SidePanel /></Tooltip.Provider></MemoryRouter>);

describe("click panel (YOLOv8n)", () => {
  beforeAll(() => {
    // jsdom lacks these; Radix tooltips query them
    globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  });

  it.each(["detect", "segment", "pose", "classify", "obb"] as const)("every %s layer has complete content", (task) => {
    const arch = load(task);
    for (const n of arch.nodes) {
      useAtlas.getState().select(n.id);
      const { unmount } = renderPanel();
      for (const s of ["what", "why", "how", "connections", "numbers", "code", "ask"]) expect(screen.getByTestId(`section-${s}`), `${n.id} ${s}`).toBeInTheDocument();
      expect(screen.queryByText(/no written explanation/i), `${n.id} ${n.module}`).toBeNull();
      unmount();
    }
  });

  const all = readdirSync(DATA).map((f) => f.replace(".json", "")).flatMap((v) => (Object.keys(read(v).tasks) as T[]).map((t) => [v, t] as const));
  it.each(all)("%s %s: every layer and training item has content", (version, task) => {
    const arch = load(task, version);
    const ids = [...arch.nodes.map((n) => n.id), "input", "train:assigner", ...arch.training.losses.map((l) => `train:loss:${l.id}`), ...arch.training.extras.map((x) => `train:extra:${x}`)];
    for (const id of ids) {
      useAtlas.getState().select(id);
      const { unmount } = renderPanel();
      expect(screen.queryByText(/no written explanation/i), `${version} ${task} ${id}`).toBeNull();
      unmount();
    }
  });

  it("explains non-layer items (input, NMS, assigner, losses)", () => {
    const arch = load("detect");
    for (const id of ["input", "post:conf", "post:nms", "train:assigner", ...arch.training.losses.map((l) => `train:loss:${l.id}`)]) {
      useAtlas.getState().select(id);
      const { unmount } = renderPanel();
      expect(screen.getByTestId("section-what"), id).toBeInTheDocument();
      expect(screen.queryByText(/no written explanation/i), id).toBeNull();
      unmount();
    }
  });

  it("switches reading level and shows position-specific text", () => {
    load("detect");
    useAtlas.getState().select("n3");
    renderPanel();
    const why = screen.getByTestId("section-why");
    expect(within(why).getByText(/At this exact position/i)).toBeInTheDocument();
    expect(why.textContent).toMatch(/80×80/);
    fireEvent.click(screen.getByTestId("level-eli5"));
    expect(screen.getByTestId("section-what").textContent).toMatch(/window/);
    fireEvent.click(screen.getByTestId("level-engineer"));
    expect(screen.getByTestId("section-what").textContent).toMatch(/Conv2d/);
  });

  it("links connections to neighbours", () => {
    load("detect");
    useAtlas.getState().select("n11");
    renderPanel();
    fireEvent.click(screen.getByTestId("from-n6"));
    expect(useAtlas.getState().selectedId).toBe("n6");
  });
});
