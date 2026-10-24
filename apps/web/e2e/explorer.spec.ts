import { expect, test } from "@playwright/test";

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
