import { expect, test, type Page } from "@playwright/test";
import { createJob, uniqueTitle } from "./fixtures";

test("one user's changes appear for another without reloading", async ({
  browser,
}) => {
  // Two browser sessions and a full create → cancel round trip.
  test.setTimeout(60_000);
  const title = uniqueTitle("Live");
  // Separate sessions, closed afterwards: each holds a live-update stream open, and over
  // HTTP/1.1 leaked ones would eat the browser's six connections per host.
  const watcherContext = await browser.newContext();
  const editorContext = await browser.newContext();
  try {
    await runScenario(
      await watcherContext.newPage(),
      await editorContext.newPage(),
      title,
    );
  } finally {
    await Promise.all([watcherContext.close(), editorContext.close()]);
  }
});

async function runScenario(watcher: Page, editor: Page, title: string) {
  // The watcher filters for a job that doesn't exist yet…
  await watcher.goto(`/jobs?q=${encodeURIComponent(title)}`);
  await expect(watcher.getByText("No jobs match these filters")).toBeVisible();
  await expect(watcher.getByRole("link", { name: "Live" })).toBeVisible();

  // …someone else creates it…
  const url = await createJob(editor, title);

  // …and it shows up on its own.
  await expect(
    watcher.getByRole("button", { name: new RegExp(`Show JOB-\\d+ ${title}`) }),
  ).toBeVisible();

  // Status changes reach an open job page too.
  await watcher.goto(url);
  await expect(
    watcher.getByText("Draft", { exact: true }).first(),
  ).toBeVisible();
  await editor
    .locator("header")
    .getByRole("button", { name: "Cancel job" })
    .click();
  await editor
    .getByRole("dialog")
    .getByLabel("Reason for cancelling")
    .fill("Duplicate of another job");
  await editor
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel job" })
    .click();

  await expect(watcher.getByText(/so it's read-only/)).toBeVisible();
  await expect(
    watcher.getByRole("list", { name: "Status history" }),
  ).toContainText("Duplicate of another job");
}
