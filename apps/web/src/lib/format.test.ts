import { describe, expect, it } from "vitest";
import { formatRelative, fromDateTimeLocal, toDateTimeLocal } from "./format";

describe("datetime-local conversion", () => {
  it("round-trips through the viewer's local time", () => {
    const iso = "2026-10-20T20:30:00.000Z";
    expect(fromDateTimeLocal(toDateTimeLocal(iso))).toBe(iso);
  });

  it("maps empty values to null and back", () => {
    expect(toDateTimeLocal(null)).toBe("");
    expect(fromDateTimeLocal("")).toBeNull();
  });
});

describe("formatRelative", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");

  it("describes past and future times in the largest sensible unit", () => {
    expect(formatRelative("2026-10-13T09:00:00Z", now)).toBe("3 hours ago");
    expect(formatRelative("2026-10-15T12:00:00Z", now)).toBe("in 2 days");
    expect(formatRelative("2026-10-13T11:59:50Z", now)).toBe("just now");
  });
});
