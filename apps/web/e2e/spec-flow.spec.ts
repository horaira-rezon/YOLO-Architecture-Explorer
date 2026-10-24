import { expect, test } from "@playwright/test";

/** The end-to-end flow from the project brief (section 13), in one run. */
test("task → version → expand → panel → level → Lab → delete → AI patch → goal text → export", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("task-detect").click();
  await page.getByTestId("version-v8").click();

  // first-run tour appears once and can be completed
  await expect(page.getByTestId("tour")).toBeVisible();
  for (let i = 0; i < 4; i++) await page.getByTestId("tour-next").click();
  await page.getByTestId("tour-next").click();
  await expect(page.getByTestId("tour")).toHaveCount(0);

  // expand a block (L2), then back
  await page.getByTestId("enter-n2").click();
  await expect(page.getByTestId("inner-cv1")).toBeVisible();
  await page.keyboard.press("Escape");

  // click a node: every panel section is there
  await page.getByTestId("node-n6").click();
  for (const s of ["what", "why", "how", "connections", "numbers", "code", "ask"]) await expect(page.getByTestId(`section-${s}`)).toBeVisible();
  await page.getByTestId("side-panel").getByTestId("level-eli5").click();
  await expect(page.getByTestId("section-what")).toContainText("helpers");

  // Lab: delete a node, see validation, undo
  await page.getByTestId("mode-toggle").click();
  await page.getByTestId("node-n10").click();
  await page.getByTestId("delete-dangling").click();
  await expect(page.getByTestId("validation-button")).toHaveText(/error/);
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("validation-button")).toHaveText(/Valid/);

  // AI patch with the offline MockProvider, accept some ops
  await page.getByTestId("open-ai").click();
  await page.getByTestId("weed-preset").click();
  await page.getByTestId("generate").click();
  await page.getByTestId("patch-op-3").getByRole("checkbox").uncheck();
  await page.getByTestId("apply-patch").click();
  await expect(page.getByTestId("change-story")).toBeVisible();
  await page.getByRole("button", { name: "Close AI Architect" }).click();

  // click a modified node: goal explanation
  await page.locator('[data-origin="added"]').first().click();
  await expect(page.getByTestId("goal-section")).toContainText("Why the AI changed it");
  await expect(page.getByTestId("goal-section")).toContainText("For your goal");

  // export YAML
  await page.getByTestId("export-menu").click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-yaml").click()]);
  const text = Buffer.concat(await (await dl.createReadStream()).toArray()).toString("utf8");
  expect(text).toMatch(/^nc: 4/m);
  expect(text).toContain("CBAM");
});
