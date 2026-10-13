import { expect, test } from "@playwright/test";
import { createJob, expectAccessible, uniqueTitle } from "./fixtures";

test("a job is created, scheduled, worked, held, resumed and completed", async ({
  page,
}) => {
  const title = uniqueTitle("Lifecycle");
  await createJob(page, title);

  const actions = page.locator("header");
  await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();

  // Scheduling needs a time.
  await actions.getByRole("button", { name: "Schedule" }).click();
  const schedule = page.getByRole("dialog");
  await schedule.getByLabel("Scheduled for").fill("2030-01-15T09:30");
  await schedule.getByRole("button", { name: "Schedule" }).click();
  await expect(page.getByText(/is now scheduled/)).toBeVisible();

  await actions.getByRole("button", { name: "Start work" }).click();
  await expect(page.getByText(/is now in progress/)).toBeVisible();

  // Holding needs a reason.
  await actions.getByRole("button", { name: "Put on hold" }).click();
  const hold = page.getByRole("dialog");
  await hold.getByRole("button", { name: "Put on hold" }).click();
  await expect(
    hold.getByText("Add a short note so others know why."),
  ).toBeVisible();
  await hold.getByLabel("Note").fill("Waiting on parts");
  await hold.getByRole("button", { name: "Put on hold" }).click();
  await expect(page.getByText(/is now on hold/)).toBeVisible();

  await actions.getByRole("button", { name: "Resume work" }).click();
  await expect(page.getByText(/is now in progress/).last()).toBeVisible();
  await actions.getByRole("button", { name: "Mark complete" }).click();
  await expect(page.getByText(/is now completed/)).toBeVisible();

  // Completed jobs are read-only and keep their history.
  await expect(page.getByText(/so it's read-only/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
  const history = page.getByRole("list", { name: "Status history" });
  await expect(history.getByRole("listitem")).toHaveCount(6);
  await expect(history).toContainText("Waiting on parts");

  await expectAccessible(page);
});

test("the form explains what's missing", async ({ page }) => {
  await page.goto("/jobs/new");
  await page.getByRole("button", { name: "Create job" }).click();

  await expect(page.getByText("Give the job a title.")).toBeVisible();
  await expect(
    page
      .getByText("Pick the site on the map, or enter its coordinates.")
      .first(),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/jobs\/new$/);
  await expectAccessible(page);
});

test("clicking the map drops the location pin", async ({ page }) => {
  await page.goto("/jobs/new");
  const map = page.locator(".maplibregl-canvas");
  await expect(map).toBeVisible();

  await map.click({ position: { x: 200, y: 120 } });

  await expect(
    page.getByRole("spinbutton", { name: "Latitude" }),
  ).not.toHaveValue("");
  await expect(
    page.getByRole("spinbutton", { name: "Longitude" }),
  ).not.toHaveValue("");
});

test("the new-job form starts empty again after creating a job", async ({
  page,
}) => {
  await createJob(page, uniqueTitle("First"));

  await page.getByRole("link", { name: "New job" }).click();

  await expect(page.getByRole("heading", { name: "New job" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("");
});

test("a job is edited", async ({ page }) => {
  const title = uniqueTitle("Edit me");
  await createJob(page, title);

  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByRole("textbox", { name: "Title" }).fill(`${title} (updated)`);
  await page.getByRole("textbox", { name: "Assignee" }).fill("Mei Lin");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(
    page.getByRole("heading", { name: `${title} (updated)` }),
  ).toBeVisible();
  await expect(page.getByText("Mei Lin")).toBeVisible();
});

test("a draft job is deleted after confirmation", async ({ page }) => {
  const title = uniqueTitle("Delete me");
  const url = await createJob(page, title);

  await page.getByRole("button", { name: "Delete" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete job" })
    .click();

  await expect(page).toHaveURL(/\/jobs$/);
  await expect(page.getByText(/JOB-\d+ deleted/)).toBeVisible();
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "Job not found" }),
  ).toBeVisible();
});
