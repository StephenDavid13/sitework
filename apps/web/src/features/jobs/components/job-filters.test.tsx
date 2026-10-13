import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { describe, expect, it, vi } from "vitest";
import { server } from "@/test/msw-server";
import { renderWithQueryClient } from "@/test/render";
import type { JobFilters as Filters } from "../search-params";
import { JobFilters } from "./job-filters";

const none: Filters = {
  q: "",
  status: [],
  priority: [],
  sort: null,
  page: 1,
  area: null,
  near: null,
  job: null,
};

function renderFilters(filters: Partial<Filters> = {}) {
  server.use(
    http.get("*/api/jobs/stats", () =>
      HttpResponse.json({
        total: 3,
        byStatus: [
          { status: "Draft", count: 1 },
          { status: "Scheduled", count: 2 },
          { status: "InProgress", count: 0 },
          { status: "OnHold", count: 0 },
          { status: "Completed", count: 0 },
          { status: "Cancelled", count: 0 },
        ],
      }),
    ),
  );
  const setFilters = vi.fn();
  renderWithQueryClient(
    <JobFilters filters={{ ...none, ...filters }} setFilters={setFilters} />,
  );
  return setFilters;
}

describe("JobFilters", () => {
  it("shows a count on each status and toggles it, resetting the page", async () => {
    const setFilters = renderFilters({ status: ["Draft"] });

    const scheduled = await screen.findByRole("button", {
      name: /Scheduled\s*2/,
    });
    expect(screen.getByRole("button", { name: /Draft\s*1/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await userEvent.click(scheduled);
    expect(setFilters).toHaveBeenCalledWith({
      status: ["Draft", "Scheduled"],
      page: null,
    });

    await userEvent.click(screen.getByRole("button", { name: /Draft/ }));
    expect(setFilters).toHaveBeenCalledWith({ status: null, page: null });
  });

  it("debounces search so typing doesn't fire a request per keystroke", async () => {
    const setFilters = renderFilters();

    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search jobs" }),
      "roof",
    );

    expect(setFilters).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(setFilters).toHaveBeenCalledWith({ q: "roof", page: null }),
    );
    expect(setFilters).toHaveBeenCalledTimes(1);
  });

  it("removes the 'near me' filter and its distance sort together", async () => {
    const setFilters = renderFilters({
      near: "-36.85,174.76",
      sort: "Distance",
    });

    await userEvent.click(
      screen.getByRole("button", {
        name: /Remove filter: Within 10 km of you/,
      }),
    );

    expect(setFilters).toHaveBeenCalledWith({
      near: null,
      sort: null,
      page: null,
    });
  });
});
