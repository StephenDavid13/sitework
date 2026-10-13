"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  ChevronRight,
  Loader2,
  MapPin,
  SearchX,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { jobQueries, type JobListParams } from "../api";
import type { Job } from "../model";
import { PriorityLabel, StatusBadge } from "./badges";

type JobListProps = {
  params: JobListParams;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPageChange: (page: number) => void;
  filtersActive: boolean;
  onClearFilters: () => void;
};

export function JobList({
  params,
  selectedId,
  onSelect,
  onPageChange,
  filtersActive,
  onClearFilters,
}: JobListProps) {
  const { data, error, isPending, isFetching, isPlaceholderData, refetch } =
    useQuery(jobQueries.list(params));

  if (isPending) {
    return (
      <div role="status" aria-live="polite" className="space-y-2">
        <span className="sr-only">Loading jobs…</span>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[92px] w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error && !data) {
    return (
      <QueryError
        error={error}
        onRetry={() => refetch()}
        isRetrying={isFetching}
      />
    );
  }

  const page = data.page;
  const first = data.total === 0 ? 0 : (page - 1) * data.pageSize + 1;
  const last = Math.min(page * data.pageSize, data.total);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <p aria-live="polite">
          {data.total === 1 ? "1 job" : `${data.total} jobs`}
        </p>
        {isFetching && (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Updating
          </span>
        )}
      </div>

      {error && (
        <QueryError
          error={error}
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      )}

      {data.items.length === 0 ? (
        <EmptyState
          filtersActive={filtersActive}
          onClearFilters={onClearFilters}
        />
      ) : (
        <ul
          className={cn(
            "flex flex-col gap-2",
            isPlaceholderData && "opacity-60",
          )}
        >
          {data.items.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              selected={job.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}

      {data.total > data.pageSize && (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between gap-2 pt-1"
        >
          <p className="text-xs text-muted-foreground">
            {first}–{last} of {data.total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isFetching}
              onClick={() => onPageChange(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={last >= data.total || isFetching}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}

function JobRow({
  job,
  selected,
  onSelect,
}: {
  job: Job;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);

  // Selecting a marker on the map brings its row into view.
  useEffect(() => {
    if (selected) {
      ref.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    }
  }, [selected]);

  const place = job.siteName ?? job.address;

  return (
    <li ref={ref}>
      <div
        className={cn(
          "relative rounded-lg border bg-card p-3 transition-colors hover:border-foreground/25",
          selected && "border-primary/50 bg-accent/60 ring-1 ring-primary/30",
        )}
      >
        <button
          type="button"
          className="absolute inset-0 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-pressed={selected}
          onClick={() => onSelect(job.id)}
        >
          <span className="sr-only">
            Show {job.reference} {job.title} on the map
          </span>
        </button>

        <div className="pointer-events-none relative flex items-center justify-between gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {job.reference}
          </span>
          {(job.priority === "High" || job.priority === "Urgent") && (
            <PriorityLabel priority={job.priority} />
          )}
        </div>
        <p className="pointer-events-none relative mt-0.5 truncate font-medium">
          {job.title}
        </p>

        <div className="pointer-events-none relative mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {place && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{place}</span>
            </span>
          )}
          {job.scheduledFor && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" aria-hidden />
              {formatDateTime(job.scheduledFor)}
            </span>
          )}
          {job.assignee && (
            <span className="inline-flex items-center gap-1">
              <UserRound className="size-3.5" aria-hidden />
              {job.assignee}
            </span>
          )}
        </div>

        <div className="relative mt-2.5 flex items-center justify-between">
          <StatusBadge status={job.status} className="pointer-events-none" />
          <Link
            href={`/jobs/${job.id}`}
            aria-label={`Open ${job.reference}`}
            className="z-10 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium text-foreground/80 hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Open
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </li>
  );
}

function EmptyState({
  filtersActive,
  onClearFilters,
}: {
  filtersActive: boolean;
  onClearFilters: () => void;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-10 text-center">
      <SearchX className="size-8 text-muted-foreground" aria-hidden />
      {filtersActive ? (
        <>
          <p className="mt-3 font-medium">No jobs match these filters</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a different search, or clear the filters to see every job.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={onClearFilters}
          >
            Clear filters
          </Button>
        </>
      ) : (
        <>
          <p className="mt-3 font-medium">No jobs yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a job to start coordinating work across your sites.
          </p>
          <Button size="sm" className="mt-4" asChild>
            <Link href="/jobs/new">New job</Link>
          </Button>
        </>
      )}
    </div>
  );
}
