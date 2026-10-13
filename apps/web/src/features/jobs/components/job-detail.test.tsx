import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { makeHistory, makeJob, problem } from "@/test/fixtures";
import { server } from "@/test/msw-server";
import { renderWithQueryClient } from "@/test/render";
import type { Job, TransitionRequest } from "../model";
import { JobDetail } from "./job-detail";

vi.mock("./maps", () => ({ LocationMap: () => <div data-testid="map" /> }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const job = makeJob();

function renderDetail() {
  return renderWithQueryClient(
    <>
      <JobDetail id={job.id} />
      <Toaster />
    </>,
  );
}

function serveJob(current: Job = job) {
  server.use(
    http.get("*/api/jobs/:id", () => HttpResponse.json(current)),
    http.get("*/api/jobs/:id/history", () => HttpResponse.json(makeHistory())),
  );
}

describe("JobDetail", () => {
  beforeEach(() => push.mockReset());

  it("shows the job with the actions the server allows", async () => {
    serveJob();
    renderDetail();

    expect(
      await screen.findByRole("heading", {
        name: "Replace hot water cylinder",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start work" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Put on hold" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel job" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("list", { name: "Status history" }),
    ).toHaveTextContent("Created as draft");
  });

  it("applies a simple status change straight away", async () => {
    serveJob();
    let sent: TransitionRequest | undefined;
    server.use(
      http.post("*/api/jobs/:id/transitions", async ({ request }) => {
        sent = (await request.json()) as TransitionRequest;
        return HttpResponse.json(
          makeJob({
            status: "InProgress",
            version: 101,
            allowedTransitions: [],
          }),
        );
      }),
    );
    renderDetail();

    await userEvent.click(
      await screen.findByRole("button", { name: "Start work" }),
    );

    expect(sent).toEqual({
      to: "InProgress",
      note: null,
      scheduledFor: null,
      version: 100,
    });
    expect(
      await screen.findByText("JOB-1001 is now in progress"),
    ).toBeInTheDocument();
  });

  it("asks for a note before putting a job on hold", async () => {
    serveJob();
    let sent: TransitionRequest | undefined;
    server.use(
      http.post("*/api/jobs/:id/transitions", async ({ request }) => {
        sent = (await request.json()) as TransitionRequest;
        return HttpResponse.json(makeJob({ status: "OnHold", version: 101 }));
      }),
    );
    renderDetail();

    await userEvent.click(
      await screen.findByRole("button", { name: "Put on hold" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Put on hold" }),
    );
    expect(
      within(dialog).getByText("Add a short note so others know why."),
    ).toBeInTheDocument();

    await userEvent.type(
      within(dialog).getByLabelText("Note"),
      "Waiting on parts",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Put on hold" }),
    );

    expect(
      await screen.findByText("JOB-1001 is now on hold"),
    ).toBeInTheDocument();
    expect(sent).toMatchObject({
      to: "OnHold",
      note: "Waiting on parts",
      version: 100,
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the dialog open with the server's explanation when a change fails", async () => {
    serveJob();
    server.use(
      http.post("*/api/jobs/:id/transitions", () =>
        HttpResponse.json(
          ...problem(500, {
            title: "Something went wrong",
            detail: "Database is restarting.",
          }),
        ),
      ),
    );
    renderDetail();

    await userEvent.click(
      await screen.findByRole("button", { name: "Put on hold" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(
      within(dialog).getByLabelText("Note"),
      "Waiting on parts",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Put on hold" }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Database is restarting.",
    );
    expect(within(dialog).getByLabelText("Note")).toHaveValue(
      "Waiting on parts",
    );
    // The optimistic status is rolled back.
    expect(screen.getAllByText("Scheduled").length).toBeGreaterThan(0);
  });

  it("tells the user when someone else changed the job first", async () => {
    serveJob();
    server.use(
      http.post("*/api/jobs/:id/transitions", () =>
        HttpResponse.json(
          ...problem(409, {
            title: "Job was changed by someone else",
            code: "stale_version",
          }),
        ),
      ),
    );
    renderDetail();

    await userEvent.click(
      await screen.findByRole("button", { name: "Start work" }),
    );

    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "JOB-1001 was changed by someone else",
    );
  });

  it("deletes draft jobs after confirmation", async () => {
    serveJob(makeJob({ status: "Draft", canDelete: true }));
    server.use(
      http.delete(
        "*/api/jobs/:id",
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    renderDetail();

    await userEvent.click(
      await screen.findByRole("button", { name: "Delete" }),
    );
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Delete job",
      }),
    );

    expect(await screen.findByText("JOB-1001 deleted")).toBeInTheDocument();
    expect(push).toHaveBeenCalledWith("/jobs");
  });

  it("explains read-only closed jobs", async () => {
    serveJob(
      makeJob({ status: "Completed", canEdit: false, allowedTransitions: [] }),
    );
    renderDetail();

    expect(
      await screen.findByText(/This job is completed, so it's read-only/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Edit" }),
    ).not.toBeInTheDocument();
  });

  it("shows a not-found page for unknown jobs", async () => {
    server.use(
      http.get("*/api/jobs/:id", () =>
        HttpResponse.json(...problem(404, { code: "job_not_found" })),
      ),
    );
    renderDetail();

    expect(
      await screen.findByRole("heading", { name: "Job not found" }),
    ).toBeInTheDocument();
  });
});
