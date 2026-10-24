import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem("atlas-tour-done", "1")); });

/** A 600-layer model: layout must stay quick and panning smooth (onlyRenderVisibleElements, memoised nodes). */
test("600-layer graph: import, layout and pan", async ({ page }) => {
  const rows = ["  - [-1, 1, Conv, [64, 3, 2]]", "  - [-1, 1, Conv, [128, 3, 2]]", ...Array.from({ length: 596 }, () => "  - [-1, 1, Conv, [128, 3, 1]]")];
  const yaml = `nc: 4\ndepth_multiple: 1.0\nwidth_multiple: 1.0\nbackbone:\n${rows.join("\n")}\nhead:\n  - [-1, 1, Conv, [128, 3, 2]]\n  - [[-1], 1, Detect, [nc]]\n`;
  await page.goto("/lab/v8/detect/n");
  await page.getByTestId("lab-toolbar").waitFor();
  await page.getByTestId("import-yaml").click();
  await page.getByTestId("import-text").fill(yaml);
  const t0 = Date.now();
  await page.getByTestId("import-run").click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("stats")).toContainText("600 layers", { timeout: 20_000 });
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  const importMs = Date.now() - t0;

  // count animation frames while dragging the canvas for one second
  const pane = page.locator(".react-flow__pane");
  const box = (await pane.boundingBox())!;
  await page.evaluate(() => {
    (window as unknown as { __frames: number }).__frames = 0;
    const tick = () => { (window as unknown as { __frames: number }).__frames++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const start = Date.now();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 0; i < 30; i++) await page.mouse.move(box.x + box.width / 2 - i * 10, box.y + box.height / 2 - i * 20, { steps: 2 });
  await page.mouse.up();
  const seconds = (Date.now() - start) / 1000;
  const fps = (await page.evaluate(() => (window as unknown as { __frames: number }).__frames)) / seconds;
  console.log(`600 layers: import+layout ${importMs} ms, panning ≈ ${fps.toFixed(0)} fps (headless)`);
  expect(importMs).toBeLessThan(15_000);
  expect(fps).toBeGreaterThan(30);
});
