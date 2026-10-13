import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { makeJob } from "@/test/fixtures";
import { server } from "@/test/msw-server";
import { renderWithQueryClient } from "@/test/render";
import { JobForm } from "./job-form";

// MapLibre needs WebGL: stand in a button that "drops a pin". The real map is covered end to end.
vi.mock("./maps", () => ({
  LocationMap: ({
    onChange,
  }: {
    onChange?: (value: { latitude: number; longitude: number }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onChange?.({ latitude: -36.853, longitude: 174.744 })}
    >
      Drop pin
    </button>
  ),
}));

async function fillRequired() {
  await userEvent.type(screen.getByLabelText("Title"), "Fix fence");
  await userEvent.type(screen.getByLabelText("Latitude"), "-36.85");
  await userEvent.type(screen.getByLabelText("Longitude"), "174.76");
}

describe("JobForm", () => {
  it("fills the address from a dropped pin, or offers it when one is typed", async () => {
    server.use(
      http.get("*/api/geocode/reverse", () =>
        HttpResponse.json({
          label: "12 Kauri Street, Ponsonby, Auckland",
          latitude: -36.853,
          longitude: 174.744,
        }),
      ),
    );
    renderWithQueryClient(
      <JobForm
        submitLabel="Create job"
        cancelHref="/jobs"
        onSubmit={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Drop pin" }));
    expect(
      await screen.findByDisplayValue("12 Kauri Street, Ponsonby, Auckland"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Latitude")).toHaveValue(-36.853);

    await userEvent.clear(screen.getByLabelText("Address"));
    await userEvent.type(
      screen.getByLabelText("Address"),
      "Back gate on Rimu Road",
    );
    await userEvent.click(screen.getByRole("button", { name: "Drop pin" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Use it" }),
    );
    expect(screen.getByLabelText("Address")).toHaveValue(
      "12 Kauri Street, Ponsonby, Auckland",
    );
  });

  it("explains what's missing before calling the API", async () => {
    const onSubmit = vi.fn();
    renderWithQueryClient(
      <JobForm
        submitLabel="Create job"
        cancelHref="/jobs"
        onSubmit={onSubmit}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Create job" }));

    expect(
      await screen.findByText("Give the job a title."),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "Pick the site on the map, or enter its coordinates.",
      ),
    ).toHaveLength(2);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects coordinates outside the world", async () => {
    renderWithQueryClient(
      <JobForm
        submitLabel="Create job"
        cancelHref="/jobs"
        onSubmit={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByLabelText("Latitude"), "95");
    await userEvent.click(screen.getByRole("button", { name: "Create job" }));

    expect(
      await screen.findByText("Latitude must be between -90 and 90."),
    ).toBeInTheDocument();
  });

  it("sends trimmed values with blanks as nulls", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithQueryClient(
      <JobForm
        submitLabel="Create job"
        cancelHref="/jobs"
        onSubmit={onSubmit}
      />,
    );

    await fillRequired();
    await userEvent.selectOptions(screen.getByLabelText("Priority"), "Urgent");
    await userEvent.type(screen.getByLabelText("Assignee"), "  Mei Lin  ");
    await userEvent.click(screen.getByRole("button", { name: "Create job" }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: "Fix fence",
      description: null,
      priority: "Urgent",
      location: { latitude: -36.85, longitude: 174.76 },
      siteName: null,
      address: null,
      assignee: "Mei Lin",
      scheduledFor: null,
    });
  });

  it("puts the API's validation messages on the matching fields", async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError(400, {
        title: "One or more validation errors occurred.",
        errors: {
          Title: ["That title is already taken."],
          "Location.Longitude": [
            "The field Longitude must be between -180 and 180.",
          ],
        },
      }),
    );
    renderWithQueryClient(
      <JobForm
        submitLabel="Create job"
        cancelHref="/jobs"
        onSubmit={onSubmit}
      />,
    );

    await fillRequired();
    await userEvent.click(screen.getByRole("button", { name: "Create job" }));

    expect(
      await screen.findByText("That title is already taken."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The field Longitude must be between -180 and 180."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("shows other failures above the buttons and keeps the user's input", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    renderWithQueryClient(
      <JobForm
        submitLabel="Create job"
        cancelHref="/jobs"
        onSubmit={onSubmit}
      />,
    );

    await fillRequired();
    await userEvent.click(screen.getByRole("button", { name: "Create job" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Can't reach the server",
    );
    expect(screen.getByLabelText("Title")).toHaveValue("Fix fence");
  });

  it("offers to reload when someone else changed the job first", async () => {
    const onReload = vi.fn();
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError(409, {
        title: "Job was changed by someone else",
        code: "stale_version",
      }),
    );
    renderWithQueryClient(
      <JobForm
        job={makeJob()}
        submitLabel="Save changes"
        cancelHref="/jobs/1"
        onSubmit={onSubmit}
        onReload={onReload}
      />,
    );

    expect(screen.getByLabelText("Title")).toHaveValue(
      "Replace hot water cylinder",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "JOB-1001 was changed by someone else",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Reload latest" }),
    );
    expect(onReload).toHaveBeenCalled();
  });
});
