import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { describe, expect, it } from "vitest";
import type { components } from "@/lib/api/schema";
import { server } from "@/test/msw-server";
import { renderWithQueryClient } from "@/test/render";
import { ApiStatus } from "./api-status";

const healthy: components["schemas"]["StatusResponse"] = {
  service: "sitework-api",
  version: "1.0.0+abcdef0123456789",
  environment: "Development",
  database: "Healthy",
  serverTime: "2026-10-13T05:00:00Z",
};

describe("ApiStatus", () => {
  it("shows a loading state, then the API and database status", async () => {
    server.use(http.get("*/api/status", () => HttpResponse.json(healthy)));

    renderWithQueryClient(<ApiStatus />);

    expect(screen.getByRole("status")).toHaveTextContent(/checking the api/i);
    expect(await screen.findByText("sitework-api")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("1.0.0+abcdef0")).toBeInTheDocument();
  });

  it("shows the server's problem details and recovers on retry", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/status", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(
              {
                title: "Service unavailable",
                status: 503,
                detail: "Database is restarting.",
              },
              {
                status: 503,
                headers: { "Content-Type": "application/problem+json" },
              },
            )
          : HttpResponse.json(healthy);
      }),
    );

    renderWithQueryClient(<ApiStatus />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Service unavailable");
    expect(alert).toHaveTextContent("Database is restarting.");

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("sitework-api")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains when the API can't be reached", async () => {
    server.use(http.get("*/api/status", () => HttpResponse.error()));

    renderWithQueryClient(<ApiStatus />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Can't reach the server",
    );
  });
});
