"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import { describeError } from "@/lib/api/errors";
import type { components } from "@/lib/api/schema";

type HealthStatus = components["schemas"]["HealthStatus"];

export const statusQuery = queryOptions({
  queryKey: ["status"],
  queryFn: ({ signal }) => unwrap(api.GET("/api/status", { signal })),
});

const healthStyles: Record<HealthStatus, string> = {
  Healthy:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  Degraded: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  Unhealthy: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

const buttonClass =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900";

export function ApiStatus() {
  const { data, error, isPending, isFetching, refetch } = useQuery(statusQuery);

  return (
    <section
      aria-labelledby="api-status-heading"
      className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="api-status-heading" className="text-lg font-semibold">
          System status
        </h2>
        {!isPending && (
          <button
            type="button"
            className={buttonClass}
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? "Checking…" : error ? "Retry" : "Refresh"}
          </button>
        )}
      </div>

      {isPending ? (
        <div role="status" aria-live="polite" className="mt-4 space-y-3">
          <span className="sr-only">Checking the API…</span>
          {[0, 1, 2, 3].map((row) => (
            <div
              key={row}
              className="h-5 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800"
            />
          ))}
        </div>
      ) : error ? (
        <div
          role="alert"
          className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-900 dark:bg-red-950 dark:text-red-200"
        >
          <p className="font-medium">{describeError(error).title}</p>
          <p className="mt-1">{describeError(error).detail}</p>
        </div>
      ) : (
        <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-zinc-500">Service</dt>
          <dd>{data.service}</dd>
          <dt className="text-zinc-500">Version</dt>
          <dd className="font-mono">
            {data.version.replace(/\+(.{7}).*/, "+$1")}
          </dd>
          <dt className="text-zinc-500">Environment</dt>
          <dd>{data.environment}</dd>
          <dt className="text-zinc-500">Database</dt>
          <dd>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${healthStyles[data.database]}`}
            >
              {data.database}
            </span>
          </dd>
        </dl>
      )}
    </section>
  );
}
