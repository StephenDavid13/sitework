import { expect, test } from "@playwright/test";
import { createJob, expectAccessible, uniqueTitle } from "./fixtures";

test("the workspace shows jobs on a list and a map", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on(
    "console",
    (message) => message.type() === "error" && errors.push(message.text()),
  );

  await page.goto("/");

  await expect(page).toHaveURL(/\/jobs$/);
  await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
  await expect(page.getByText(/^\d+ jobs?$/)).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.getByText("All systems normal")).toBeVisible();

  await expectAccessible(page);
  // Includes CSP violations and MapLibre worker failures.
  expect(errors).toEqual([]);
});

test("selecting a job in the list shows it on the map and in the URL", async ({
  page,
}) => {
  const title = uniqueTitle("Map pick");
  await createJob(page, title);
  await page.goto(`/jobs?q=${encodeURIComponent(title)}`);

  await page
    .getByRole("button", { name: new RegExp(`Show JOB-\\d+ ${title}`) })
    .click();

  await expect(page).toHaveURL(/[?&]job=/);
  const popup = page.locator(".maplibregl-popup");
  await expect(popup).toContainText(title);
  await popup.getByRole("button", { name: "Close" }).click();
  await expect(popup).toHaveCount(0);
});

test("search and status filters narrow the list and live in the URL", async ({
  page,
}) => {
  const title = uniqueTitle("Filterable");
  await createJob(page, title);
  await page.goto("/jobs");

  await page.getByRole("searchbox", { name: "Search jobs" }).fill(title);
  await expect(page).toHaveURL(new RegExp(`q=${title.split(" ")[0]}`));
  await expect(page.getByText("1 job", { exact: true })).toBeVisible();

  // The new job is a draft, so filtering to completed work hides it.
  await page
    .getByRole("group", { name: "Filter by status" })
    .getByRole("button", { name: /Completed/ })
    .click();
  await expect(page).toHaveURL(/status=Completed/);
  await expect(page.getByText("No jobs match these filters")).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/status=/);
});

test("unknown jobs show a not-found page", async ({ page }) => {
  await page.goto("/jobs/00000000-0000-7000-8000-000000000000");
  await expect(
    page.getByRole("heading", { name: "Job not found" }),
  ).toBeVisible();
});

test("on phones the list and map are tabs @mobile", async ({ page }) => {
  await page.goto("/jobs");
  const tabs = page.getByRole("tablist", { name: "View" });

  await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
  await tabs.getByRole("tab", { name: "Map" }).click();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Jobs" })).toBeHidden();

  // No sideways scrolling at phone width.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
