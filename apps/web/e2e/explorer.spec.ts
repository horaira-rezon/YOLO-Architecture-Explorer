import { expect, test } from "@playwright/test";

// the first-run tour is tested on its own; other tests start with it dismissed
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem("atlas-tour-done", "1")); });

test("zoom levels, inside view, keyboard, search and walkthrough", async ({ page }) => {
  await page.goto("/explore/v8/detect/n");
  await expect(page.getByTestId("node-n6")).toBeVisible();

  // look inside a C2f (L2), then expand everything (L3), select a primitive (L4)
  await page.getByTestId("enter-n2").click();
  await expect(page.getByTestId("breadcrumbs")).toContainText("Layer 2 C2f");
  await expect(page.getByTestId("inner-cv1")).toBeVisible();
  await page.getByRole("button", { name: "Expand all" }).click();
  await expect(page.getByTestId("inner-m.0.cv1.conv")).toBeVisible();
  await page.getByTestId("inner-m.0.cv1.conv").click();
  await expect(page.getByTestId("inside-panel")).toContainText("Conv2d");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("node-n6")).toBeVisible();

  // keyboard: select a node and walk forward along its connection
  await page.getByTestId("node-n3").click();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("panel-title")).toHaveText("C2f");

  // search palette
  await page.keyboard.press("Escape");
  await page.keyboard.press("/");
  await page.getByTestId("palette-input").fill("SPPF");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("panel-title")).toHaveText("SPPF");

  // overview (L0) via slider keyboard
  await page.getByRole("slider", { name: "Zoom level" }).focus();
  await page.keyboard.press("Home");
  await expect(page.getByTestId("overview-backbone")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("node-n6")).toBeVisible();

  // follow the image
  await page.getByTestId("walk-toggle").click();
  await expect(page.getByTestId("walkthrough")).toContainText("Step 1");
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByTestId("walk-next").click();
  await expect(page.getByTestId("walkthrough")).toContainText("16 channels at 320×320");
});

test("version picker, data source and compare mode", async ({ page }) => {
  await page.goto("/versions/detect");
  await expect(page.getByText("announced, not released")).toBeVisible();
  await page.getByTestId("version-13").click();
  await expect(page.getByTestId("node-n9")).toBeVisible(); // HyperACE
  await page.getByTestId("provenance").click();
  await expect(page.getByTestId("provenance-popover")).toContainText("iMoonLab/yolov13");
  await page.keyboard.press("Escape");
  await page.goto("/compare/detect?a=v8&b=11");
  await expect(page.getByTestId("compare-summary")).toContainText("New: C3k2");
  await expect(page.getByTestId("compare-summary")).toContainText("New: C2PSA");
  await page.goto("/versions/pose");
  await expect(page.getByText("YOLOv10 is an object-detection model")).toBeVisible();
});

test("Lab: insert, delete with validation, P2 helper, undo, export YAML re-imports", async ({ page }) => {
  await page.goto("/explore/v8/detect/n");
  await page.getByTestId("mode-toggle").click();
  await expect(page.getByTestId("lab-toolbar")).toBeVisible();
  await expect(page.getByTestId("validation-button")).toHaveText(/Valid/);

  // select SPPF, insert a CBAM after it from the palette
  await page.getByTestId("node-n9").click();
  await page.getByTestId("palette-CBAM").getByRole("button").click();
  await expect(page.getByTestId("stats-bar")).toContainText("+0.");
  await page.getByTestId("diff-toggle").click();
  await expect(page.locator('[data-origin="added"]')).toHaveCount(1);

  // delete the Upsample and leave the concat dangling → validation error with plain message
  await page.getByTestId("node-n10").click();
  await page.getByTestId("delete-dangling").click();
  await expect(page.getByTestId("validation-button")).toHaveText(/error/);
  await page.getByTestId("validation-button").click();
  await expect(page.getByTestId("validation-panel")).toContainText(/inputs/);
  await page.keyboard.press("Escape");
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("validation-button")).toHaveText(/Valid/);

  // whole-model: add a P2 level
  await page.getByTestId("undo").click();
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });
  await page.getByTestId("add-p2").click();
  await expect(page.getByTestId("validation-button")).toHaveText(/Valid/);
  await expect(page.getByTestId("stats-bar")).toContainText("GFLOPs");

  // export YAML and check it parses back
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-menu").click().then(() => page.getByTestId("export-yaml").click())]);
  const text = await (await dl.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8"));
  expect(text).toContain("Detect, [nc]");
  expect(text.match(/^\s+- \[/gm)?.length).toBe(29);

  // import it back into the Lab: same number of layers, no errors
  await page.getByTestId("import-yaml").click();
  await page.getByTestId("import-text").fill(text);
  await page.getByTestId("import-run").click();
  await expect(page.getByRole("status").filter({ hasText: "Imported 29 layers." })).toBeVisible();
});

test("shareable URL restores the selected node and zoom level", async ({ page }) => {
  await page.goto("/explore/v8/detect/n?node=n2&zoom=3");
  await expect(page.getByTestId("inner-m.0.cv1.conv")).toBeVisible();
  await expect(page.getByTestId("breadcrumbs")).toContainText("Layer 2 C2f");
  await expect(page).toHaveURL(/zoom=3/);
});
