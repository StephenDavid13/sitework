"use client";

import { useQuery } from "@tanstack/react-query";
import { QueryError } from "@/components/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatRelative } from "@/lib/format";
import { jobQueries } from "../api";
import { STATUS_META } from "../model";

export function JobHistory({ jobId }: { jobId: string }) {
  const { data, error, isPending, isFetching, refetch } = useQuery(
    jobQueries.history(jobId),
  );

  if (isPending) {
    return (
      <div role="status" className="space-y-3">
        <span className="sr-only">Loading history…</span>
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <QueryError
        error={error}
        onRetry={() => refetch()}
        isRetrying={isFetching}
      />
    );
  }

  // Newest first reads naturally on a work order.
  const changes = [...data].reverse();

  return (
    <ol
      aria-label="Status history"
      className="relative space-y-4 border-l pl-5"
    >
      {changes.map((change) => (
        <li key={change.id} className="relative">
          <span
            aria-hidden
            className="absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-background"
            style={{ backgroundColor: STATUS_META[change.to].color }}
          />
          <p className="text-sm">
            {change.from === null ? (
              <>
                <span className="font-medium">Created</span> as{" "}
                {STATUS_META[change.to].label.toLowerCase()}
              </>
            ) : (
              <>
                <span className="font-medium">
                  {STATUS_META[change.to].label}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  from {STATUS_META[change.from].label.toLowerCase()}
                </span>
              </>
            )}
          </p>
          {change.note && (
            <p className="mt-1 rounded-md bg-muted px-2.5 py-1.5 text-sm">
              {change.note}
            </p>
          )}
          <time
            dateTime={change.changedAt}
            title={formatDateTime(change.changedAt)}
            className="mt-0.5 block text-xs text-muted-foreground"
          >
            {formatRelative(change.changedAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}
