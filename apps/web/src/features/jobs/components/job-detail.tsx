"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { isApiError } from "@/lib/api/errors";
import { formatCoordinate, formatDateTime, formatRelative } from "@/lib/format";
import { jobQueries, useReloadJob } from "../api";
import { STATUS_META } from "../model";
import { PriorityLabel, StatusBadge } from "./badges";
import { ConflictDialog } from "./conflict-dialog";
import { DeleteJobButton } from "./delete-job-button";
import { JobHistory } from "./job-history";
import { JobNotFound } from "./job-not-found";
import { LocationMap } from "./maps";
import { TransitionActions } from "./transition-actions";

export function JobDetail({ id }: { id: string }) {
  const {
    data: job,
    error,
    isPending,
    isFetching,
    refetch,
  } = useQuery(jobQueries.detail(id));
  const reload = useReloadJob(id);
  const [conflict, setConflict] = useState(false);

  if (isPending) {
    return <JobDetailSkeleton />;
  }

  if (error && !job) {
    return isApiError(error, 404) ? (
      <JobNotFound />
    ) : (
      <PageShell>
        <QueryError
          error={error}
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      </PageShell>
    );
  }

  const { latitude, longitude } = job.location;

  return (
    <PageShell>
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">
              {job.reference}
            </span>
            <StatusBadge status={job.status} />
            <PriorityLabel priority={job.priority} />
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-balance">
            {job.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Updated{" "}
            <time
              dateTime={job.updatedAt}
              title={formatDateTime(job.updatedAt)}
            >
              {formatRelative(job.updatedAt)}
            </time>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TransitionActions job={job} onConflict={() => setConflict(true)} />
          {job.canEdit && (
            <Button variant="outline" asChild>
              <Link href={`/jobs/${job.id}/edit`}>
                <Pencil aria-hidden />
                Edit
              </Link>
            </Button>
          )}
          {job.canDelete && <DeleteJobButton job={job} />}
        </div>
      </header>

      {!job.canEdit && (
        <p className="mt-4 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
          This job is {STATUS_META[job.status].label.toLowerCase()}, so
          it&apos;s read-only and kept for the record.
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              {job.description ? (
                <p className="text-sm whitespace-pre-line">{job.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No description.</p>
              )}
              <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Detail label="Site">{job.siteName}</Detail>
                <Detail label="Address">{job.address}</Detail>
                <Detail label="Assignee">{job.assignee}</Detail>
                <Detail label="Scheduled for">
                  {job.scheduledFor && formatDateTime(job.scheduledFor)}
                </Detail>
                {job.completedAt && (
                  <Detail label="Completed">
                    {formatDateTime(job.completedAt)}
                  </Detail>
                )}
                <Detail label="Created">{formatDateTime(job.createdAt)}</Detail>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <JobHistory jobId={job.id} />
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit overflow-hidden pt-0">
          <div className="h-64 border-b">
            <LocationMap
              value={{ latitude, longitude }}
              color={STATUS_META[job.status].color}
            />
          </div>
          <CardContent className="flex flex-col gap-1 text-sm">
            <p className="font-medium">{job.siteName ?? "Location"}</p>
            {job.address && (
              <p className="text-muted-foreground">{job.address}</p>
            )}
            <p className="font-mono text-xs text-muted-foreground">
              {formatCoordinate(latitude)}, {formatCoordinate(longitude)}
            </p>
            <a
              className="mt-2 inline-flex w-fit items-center gap-1 text-xs font-medium underline underline-offset-2"
              href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`}
              target="_blank"
              rel="noreferrer"
            >
              Open in OpenStreetMap
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </CardContent>
        </Card>
      </div>

      <ConflictDialog
        open={conflict}
        onOpenChange={setConflict}
        reference={job.reference}
        onReload={() => {
          void reload();
          setConflict(false);
        }}
      />
    </PageShell>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">
        {children || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <Link
        href="/jobs"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All jobs
      </Link>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function JobDetailSkeleton() {
  return (
    <PageShell>
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Loading job…</span>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-8 w-2/3" />
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    </PageShell>
  );
}
