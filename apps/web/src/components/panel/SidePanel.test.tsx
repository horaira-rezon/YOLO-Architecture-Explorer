import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import * as Tooltip from "@radix-ui/react-tooltip";
import { compileYaml, type ModelData } from "@yolo-atlas/core";
import { useAtlas } from "../../store/atlas";
import { SidePanel } from "./SidePanel";

const data = JSON.parse(readFileSync(join(__dirname, "../../../../../packages/core/data/models/v8.json"), "utf8")) as ModelData;

function load(task: "detect" | "segment" | "pose" | "classify" | "obb") {
  const v = data.tasks[task]!.variants.n!;
  const arch = compileYaml(v.yamlText, { version: "v8", task, scale: "n", inputSize: v.inputSize, meta: { source: v.source, confidence: "verified", retrievedAt: v.retrievedAt, notes: [] } });
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
