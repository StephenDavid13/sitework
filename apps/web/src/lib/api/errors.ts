/** RFC 9457 problem details, returned by the API for every error response. */
export type ProblemDetails = {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  errors?: Record<string, string[]>;
};

/** A non-2xx response from the API. Network failures surface as plain `TypeError`s instead. */
export class ApiError extends Error {
  readonly status: number;
  readonly problem?: ProblemDetails;

  constructor(status: number, problem?: ProblemDetails) {
    super(
      problem?.detail ??
        problem?.title ??
        `Request failed with status ${status}`,
    );
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }
}

export function isProblemDetails(value: unknown): value is ProblemDetails {
  return (
    typeof value === "object" &&
    value !== null &&
    ("title" in value || "status" in value || "detail" in value)
  );
}

/** Network failures and 5xx responses are worth retrying; 4xx responses are not. */
export function isRetryable(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status >= 500;
}

export function describeError(error: unknown): {
  title: string;
  detail: string;
} {
  if (error instanceof ApiError && error.problem) {
    return {
      title: error.problem.title ?? "Something went wrong",
      detail: error.problem.detail ?? error.message,
    };
  }
  if (error instanceof ApiError && error.status < 500) {
    return { title: "Request failed", detail: error.message };
  }
  // No problem body: the request never reached the API, or a proxy answered for it.
  return {
    title: "Can't reach the server",
    detail:
      "The Sitework API isn't responding. Check your connection and try again.",
  };
}
