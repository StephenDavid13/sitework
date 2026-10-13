import { describe, expect, it } from "vitest";
import {
  hasActiveFilters,
  toListParams,
  toMapParams,
  type JobFilters,
} from "./search-params";

const none: JobFilters = {
  q: "",
  status: [],
  priority: [],
  sort: null,
  page: 1,
  area: null,
  near: null,
  job: null,
};

describe("toListParams", () => {
  it("omits empty filters so they don't reach the query string", () => {
    expect(toListParams(none)).toEqual({ page: 1, pageSize: 20 });
  });

  it("turns 'near me' into a 10 km radius search", () => {
    expect(
      toListParams({ ...none, near: "-36.85,174.76", sort: "Distance" }),
    ).toMatchObject({
      nearLat: -36.85,
      nearLng: 174.76,
      radiusKm: 10,
      sort: "Distance",
    });
  });

  it("drops a distance sort when there is no location to measure from", () => {
    expect(toListParams({ ...none, sort: "Distance" }).sort).toBeUndefined();
  });

  it("passes the selected map area as a bounding box", () => {
    expect(toListParams({ ...none, area: "174,-37,175,-36" }).bbox).toBe(
      "174,-37,175,-36",
    );
  });
});

describe("toMapParams", () => {
  it("shares the list's filters but uses the current viewport, not the saved area", () => {
    const filters = {
      ...none,
      q: "roof",
      status: ["Draft" as const],
      area: "1,1,2,2",
    };
    expect(toMapParams(filters, "174,-37,175,-36")).toEqual({
      q: "roof",
      status: ["Draft"],
      priority: undefined,
      bbox: "174,-37,175,-36",
    });
  });
});

describe("hasActiveFilters", () => {
  it("ignores paging, sorting and selection", () => {
    expect(
      hasActiveFilters({ ...none, page: 3, sort: "Priority", job: "x" }),
    ).toBe(false);
    expect(hasActiveFilters({ ...none, status: ["OnHold"] })).toBe(true);
  });
});
