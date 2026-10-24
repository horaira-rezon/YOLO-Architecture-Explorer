import { expect, test } from "@playwright/test";

// the first-run tour is tested on its own; other tests start with it dismissed
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem("atlas-tour-done", "1")); });

test("AI Architect with the offline MockProvider: preset → generate → accept some → apply", async ({ page }) => {
  await page.goto("/lab/v8/detect/n");
  await page.getByTestId("open-ai").click();
  await page.getByTestId("example-preset").click();
  await page.getByTestId("generate").click();
  await expect(page.getByTestId("patch-preview")).toBeVisible();
  await expect(page.getByTestId("patch-op-3")).toBeVisible();
  // reject the GhostConv swap, keep the rest
  await page.getByTestId("patch-op-3").getByRole("checkbox").uncheck();
  await expect(page.getByTestId("patch-preview")).toContainText("The resulting model is valid");
  await page.getByTestId("apply-patch").click();
  await expect(page.getByTestId("change-story")).toBeVisible();
  await expect(page.getByTestId("validation-button")).toHaveText(/Valid/);
  await page.locator(".react-flow__controls-fitview").click(); // only nodes in view are rendered
  await expect(page.locator('[data-origin="added"]')).toHaveCount(7); // CBAM + 6 P2 nodes
  // undo the whole patch in one step
  await page.getByTestId("undo").click();
  await expect(page.locator('[data-origin="added"]')).toHaveCount(0);
});

test("Gemini provider: structured-output request is well formed (network intercepted)", async ({ page }) => {
  let body: Record<string, unknown> = {};
  let key = "";
  await page.route("https://generativelanguage.googleapis.com/**", async (route) => {
    body = route.request().postDataJSON() as Record<string, unknown>;
    key = route.request().headers()["x-goog-api-key"] ?? "";
    const patch = {
      summary: "Add a P2 level for small cracks.",
      assumptions: ["Cracks are 10–40 px."],
      suggestedExperiments: ["Baseline", "Add P2"],
      operations: [{ op: "addHeadLevel", level: "P2", rationaleSimple: "More detailed map.", rationaleForGoal: "Small cracks get more cells.", tradeoff: "More compute.", risk: "Slower.", confidence: "high", isHypothesis: true, breaksPretrained: true }],
    };
    await route.fulfill({ json: { candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(patch) }] }, finishReason: "STOP" }] } });
  });
  await page.goto("/settings");
  await page.getByRole("radio", { name: /Google Gemini/ }).check();
  await page.getByPlaceholder("paste your key").fill("test-key-not-real");
  await page.getByTestId("save-ai").click();
  await page.goto("/lab/v8/detect/n");
  await page.getByTestId("open-ai").click();
  await page.getByTestId("goal-input").fill("detect small road cracks on a Raspberry Pi");
  await page.getByTestId("generate").click();
  await expect(page.getByTestId("patch-preview")).toContainText("Add a P2 level");
  expect(key).toBe("test-key-not-real");
  const cfg = body.generationConfig as Record<string, unknown>;
  expect(cfg.responseMimeType).toBe("application/json");
  expect(cfg.responseJsonSchema).toBeTruthy();
  expect(JSON.stringify(body.systemInstruction)).toContain("Return a PATCH");
});

test("after an AI patch every node (changed or not) explains itself for the goal", async ({ page }) => {
  await page.goto("/lab/v8/detect/n");
  await page.getByTestId("open-ai").click();
  await page.getByTestId("example-preset").click();
  await page.getByTestId("generate").click();
  await page.getByTestId("apply-patch").click();
  await expect(page.getByTestId("change-story")).toContainText("The problem");
  await expect(page.getByTestId("change-story")).toContainText("Add a P2 detection level");
  // background job: explain all layers
  await page.getByTestId("explain-all-start").click();
  await expect(page.getByTestId("explain-all-start")).toContainText("Done");
  // close the AI panel and click an unchanged node and a modified node
  await page.getByRole("button", { name: "Close AI Architect" }).click();
  await page.getByTestId("node-n3").click();
  await expect(page.getByTestId("goal-section")).toContainText("For your goal");
  await expect(page.getByTestId("goal-section")).toContainText("unchanged");
  await page.locator('[data-origin="added"]').first().click();
  await expect(page.getByTestId("goal-section")).toContainText("Why the AI changed it");
  // a manual edit of a block that already has an explanation marks it out of date
  await page.getByTestId("node-n4").click();
  await expect(page.getByTestId("goal-section")).toContainText("For your goal");
  await page.locator("#arg-c2").fill("320");
  await page.getByTestId("apply-args").click();
  await expect(page.getByTestId("goal-stale")).toBeVisible();
});

test("Gemini rejects the response schema with 400 → the app retries in plain JSON mode", async ({ page }) => {
  const bodies: Record<string, unknown>[] = [];
  await page.route("https://generativelanguage.googleapis.com/**", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    bodies.push(body);
    const cfg = body.generationConfig as Record<string, unknown>;
    if (cfg.responseJsonSchema) {
      await route.fulfill({ status: 400, json: { error: { code: 400, message: "Request contains an invalid argument.", status: "INVALID_ARGUMENT" } } });
      return;
    }
    const patch = { summary: "Add a P2 level for small cracks.", assumptions: [], suggestedExperiments: ["Baseline"], operations: [{ op: "addHeadLevel", level: "P2", rationaleSimple: "More detail.", rationaleForGoal: "Small cracks get more cells.", tradeoff: "More compute.", risk: "Slower.", confidence: "high", isHypothesis: true, breaksPretrained: true }] };
    await route.fulfill({ json: { candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(patch) }] }, finishReason: "STOP" }] } });
  });
  await page.goto("/settings");
  await page.getByRole("radio", { name: /Google Gemini/ }).check();
  await page.getByPlaceholder("paste your key").fill("test-key-not-real");
  await page.getByTestId("save-ai").click();
  await page.goto("/lab/v8/detect/n");
  await page.getByTestId("open-ai").click();
  await page.getByTestId("example-preset").click();
  await page.getByTestId("generate").click();
  await expect(page.getByTestId("patch-preview")).toContainText("Add a P2 level");
  expect(bodies.length).toBe(2);
  expect((bodies[1]!.generationConfig as Record<string, unknown>).responseMimeType).toBe("application/json");
  expect(JSON.stringify(bodies[1]!.systemInstruction)).toContain("Return only JSON matching this JSON Schema");
});
