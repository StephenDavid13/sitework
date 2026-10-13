import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** A title no other test (or earlier run) uses, so assertions can't hit someone else's job. */
export function uniqueTitle(prefix: string) {
  return `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Creates a job through the form and returns its detail page URL. */
export async function createJob(page: Page, title: string) {
  await page.goto("/jobs/new");
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await page
    .getByRole("textbox", { name: "Description" })
    .fill("Created by the end-to-end tests.");
  await page.getByRole("combobox", { name: "Priority" }).selectOption("High");
  await page.getByRole("spinbutton", { name: "Latitude" }).fill("-36.8521");
  await page.getByRole("spinbutton", { name: "Longitude" }).fill("174.7634");
  await page.getByRole("textbox", { name: "Site name" }).fill("E2E site");
  await page.getByRole("button", { name: "Create job" }).click();

  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText(/JOB-\d+ created/)).toBeVisible();
  return page.url();
}

/** Fails on serious or critical WCAG issues. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // The map canvas is decorative for assistive tech; the list is the accessible equivalent.
    .exclude(".maplibregl-canvas")
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    serious.map(
      (v) =>
        `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    ),
  ).toEqual([]);
}
