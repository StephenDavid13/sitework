import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { describe, expect, it, vi } from "vitest";
import { problem } from "@/test/fixtures";
import { server } from "@/test/msw-server";
import { renderWithQueryClient } from "@/test/render";
import { AddressSearch } from "./address-search";

const near = { latitude: -36.8485, longitude: 174.7633 };
const kauri = {
  label: "12 Kauri Street, Ponsonby, Auckland",
  latitude: -36.853,
  longitude: 174.744,
};

describe("AddressSearch", () => {
  it("suggests places once three characters are typed, biased towards the map", async () => {
    const requests: string[] = [];
    server.use(
      http.get("*/api/geocode/search", ({ request }) => {
        requests.push(new URL(request.url).search);
        return HttpResponse.json([kauri]);
      }),
    );
    const onSelect = vi.fn();
    renderWithQueryClient(<AddressSearch near={near} onSelect={onSelect} />);

    const input = screen.getByRole("combobox", {
      name: "Search for an address or place",
    });
    await userEvent.type(input, "12");
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(requests).toEqual([]);

    await userEvent.type(input, " Kauri");
    const option = await screen.findByRole("option", { name: kauri.label });
    expect(requests).toEqual(["?q=12%20Kauri&nearLat=-36.85&nearLng=174.76"]);
    expect(screen.getByText(/OpenStreetMap contributors/)).toBeInTheDocument();

    await userEvent.click(option);
    expect(onSelect).toHaveBeenCalledWith(kauri);
    expect(input).toHaveValue(kauri.label);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("can be driven from the keyboard without submitting the surrounding form", async () => {
    server.use(
      http.get("*/api/geocode/search", () => HttpResponse.json([kauri])),
    );
    const onSelect = vi.fn();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    renderWithQueryClient(
      <form onSubmit={onSubmit}>
        <AddressSearch near={near} onSelect={onSelect} />
      </form>,
    );

    const input = screen.getByRole("combobox");
    await userEvent.type(input, "Kauri St");
    await screen.findByRole("option", { name: kauri.label });
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(onSelect).toHaveBeenCalledWith(kauri);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("explains when the search service is unavailable", async () => {
    server.use(
      http.get("*/api/geocode/search", () =>
        HttpResponse.json(
          ...problem(503, {
            title: "Address search is unavailable",
            detail:
              "The address search service didn't respond. Drop a pin on the map or enter coordinates instead.",
          }),
        ),
      ),
    );
    renderWithQueryClient(<AddressSearch near={near} onSelect={vi.fn()} />);

    await userEvent.type(screen.getByRole("combobox"), "Kauri St");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Drop a pin on the map",
    );
  });

  it("says so when nothing matches", async () => {
    server.use(http.get("*/api/geocode/search", () => HttpResponse.json([])));
    renderWithQueryClient(<AddressSearch near={null} onSelect={vi.fn()} />);

    await userEvent.type(screen.getByRole("combobox"), "zzzzqqq");

    await waitFor(() =>
      expect(screen.getByText(/No matching places/)).toBeInTheDocument(),
    );
  });
});
