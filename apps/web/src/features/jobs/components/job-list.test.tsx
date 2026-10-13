import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { describe, expect, it, vi } from "vitest";
import { makeJob, makePage, problem } from "@/test/fixtures";
import { server } from "@/test/msw-server";
import { renderWithQueryClient } from "@/test/render";
import { JobList } from "./job-list";

const params = { page: 1, pageSize: 20 };

function renderList(
  overrides: Partial<React.ComponentProps<typeof JobList>> = {},
) {
  const props = {
    params,
    selectedId: null,
    onSelect: vi.fn(),
    onPageChange: vi.fn(),
    filtersActive: false,
    onClearFilters: vi.fn(),
    ...overrides,
  };
  renderWithQueryClient(<JobList {...props} />);
  return props;
}

describe("JobList", () => {
  it("shows skeletons while loading, then the jobs", async () => {
    server.use(
      http.get("*/api/jobs", () => HttpResponse.json(makePage([makeJob()]))),
    );

    renderList();

    expect(screen.getByRole("status")).toHaveTextContent("Loading jobs");
    expect(
      await screen.findByText("Replace hot water cylinder"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 job")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Show JOB-1001 Replace hot water cylinder/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open JOB-1001/ })).toHaveAttribute(
      "href",
      "/jobs/0199a000-0000-7000-8000-000000000001",
    );
  });

  it("selects a job for the map when its row is pressed", async () => {
    server.use(
      http.get("*/api/jobs", () => HttpResponse.json(makePage([makeJob()]))),
    );
    const { onSelect } = renderList();

    await userEvent.click(
      await screen.findByRole("button", { name: /Show JOB-1001/ }),
    );

    expect(onSelect).toHaveBeenCalledWith(
      "0199a000-0000-7000-8000-000000000001",
    );
  });

  it("marks the selected job", async () => {
    server.use(
      http.get("*/api/jobs", () => HttpResponse.json(makePage([makeJob()]))),
    );
    renderList({ selectedId: makeJob().id });

    expect(
      await screen.findByRole("button", { name: /Show JOB-1001/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("offers to clear filters when nothing matches", async () => {
    server.use(http.get("*/api/jobs", () => HttpResponse.json(makePage([]))));
    const { onClearFilters } = renderList({ filtersActive: true });

    expect(
      await screen.findByText("No jobs match these filters"),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Clear filters" }),
    );
    expect(onClearFilters).toHaveBeenCalled();
  });

  it("invites creating the first job when there are none at all", async () => {
    server.use(http.get("*/api/jobs", () => HttpResponse.json(makePage([]))));
    renderList();

    expect(await screen.findByText("No jobs yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New job" })).toHaveAttribute(
      "href",
      "/jobs/new",
    );
  });

  it("explains failures and retries on request", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/jobs", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(
              ...problem(500, {
                title: "Database unavailable",
                detail: "Try again shortly.",
              }),
            )
          : HttpResponse.json(makePage([makeJob()]));
      }),
    );
    renderList();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Database unavailable");
    await userEvent.click(
      within(alert).getByRole("button", { name: "Try again" }),
    );

    expect(
      await screen.findByText("Replace hot water cylinder"),
    ).toBeInTheDocument();
  });

  it("pages through results", async () => {
    const jobs = Array.from({ length: 20 }, (_, i) =>
      makeJob({ id: `id-${i}`, reference: `JOB-${2000 + i}` }),
    );
    server.use(
      http.get("*/api/jobs", () =>
        HttpResponse.json(makePage(jobs, { total: 45 })),
      ),
    );
    const { onPageChange } = renderList();

    expect(await screen.findByText("1–20 of 45")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
