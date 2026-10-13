import createClient from "openapi-fetch";
import { ApiError, isProblemDetails } from "./errors";
import type { paths } from "./schema";

// Browser: same origin (ingress in Kubernetes, rewrite proxy in dev).
// Server-side rendering: call the API service directly.
const baseUrl =
  typeof window === "undefined"
    ? (process.env.API_INTERNAL_URL ?? "http://localhost:5080")
    : window.location.origin;

export const api = createClient<paths>({
  baseUrl,
  // Resolve fetch per call so interceptors installed later (e.g. MSW in tests) are honoured.
  fetch: (request) => globalThis.fetch(request),
});

type ApiResult<T> = { data?: T; error?: unknown; response: Response };

/** Resolves to the response body, or throws an `ApiError` carrying the server's ProblemDetails. */
export async function unwrap<T>(request: Promise<ApiResult<T>>): Promise<T> {
  const { data, error, response } = await request;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      isProblemDetails(error) ? error : undefined,
    );
  }
  return data as T;
}
