import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem("atlas-tour-done", "1")); });

const pages: [string, string, string?][] = [
  ["landing", "/"],
  ["versions", "/versions/detect"],
  ["explorer", "/explore/v8/detect/n", "node-n6"],
  ["explorer-panel", "/explore/v8/detect/n?node=n6", "side-panel"],
  ["lab", "/lab/v8/detect/n", "lab-toolbar"],
  ["compare", "/compare/detect?a=v8&b=11", "compare-summary"],
  ["settings", "/settings"],
];

for (const [name, url, wait] of pages) {
  test(`a11y: ${name}`, async ({ page }) => {
    await page.goto(url);
    if (wait) await page.getByTestId(wait).first().waitFor();
    await page.waitForTimeout(400);
    // React Flow's internal SVG markers and our decorative diagram are covered by the list view alternative
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).exclude(".react-flow__minimap").analyze();
    const bad = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length}× ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    expect(bad).toEqual([]);
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`a11y contrast in ${theme} theme`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("atlas-theme", t), theme);
    await page.goto("/explore/v8/detect/n?node=n6");
    await page.getByTestId("side-panel").waitFor();
    const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).exclude(".react-flow__minimap").analyze();
    expect(results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")}: ${n.failureSummary?.split("\n")[1] ?? ""}`)).slice(0, 15)).toEqual([]);
  });
}
