import { describe, expect, it } from "vitest";
import {
  ApiError,
  describeError,
  fieldErrors,
  isRetryable,
  isStaleVersion,
} from "./errors";

describe("fieldErrors", () => {
  it("camelCases model-binding paths and keeps the first message per field", () => {
    const error = new ApiError(400, {
      errors: {
        Title: ["The Title field is required.", "Second message"],
        "Location.Latitude": ["Out of range."],
        scheduledFor: ["Set a scheduled time."],
      },
    });

    expect(fieldErrors(error)).toEqual({
      title: "The Title field is required.",
      "location.latitude": "Out of range.",
      scheduledFor: "Set a scheduled time.",
    });
  });

  it("is empty for anything that isn't a validation problem", () => {
    expect(fieldErrors(new ApiError(500))).toEqual({});
    expect(fieldErrors(new TypeError("Failed to fetch"))).toEqual({});
  });
});

describe("describeError", () => {
  it("uses the server's problem title and detail", () => {
    const error = new ApiError(409, {
      title: "Transition not allowed",
      detail: "JOB-1 can't move.",
    });
    expect(describeError(error)).toEqual({
      title: "Transition not allowed",
      detail: "JOB-1 can't move.",
    });
  });

  it("treats network failures and bodiless 5xx as an unreachable server", () => {
    expect(describeError(new TypeError("Failed to fetch")).title).toBe(
      "Can't reach the server",
    );
    expect(describeError(new ApiError(502)).title).toBe(
      "Can't reach the server",
    );
  });
});

describe("retry policy", () => {
  it("retries network and server errors but not client errors", () => {
    expect(isRetryable(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRetryable(new ApiError(503))).toBe(true);
    expect(isRetryable(new ApiError(404))).toBe(false);
    expect(isRetryable(new ApiError(429))).toBe(false);
  });

  it("recognises stale-version conflicts by their code", () => {
    expect(isStaleVersion(new ApiError(409, { code: "stale_version" }))).toBe(
      true,
    );
    expect(
      isStaleVersion(new ApiError(409, { code: "transition_not_allowed" })),
    ).toBe(false);
  });
});
