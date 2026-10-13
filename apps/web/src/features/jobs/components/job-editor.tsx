"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { QueryError } from "@/components/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { isApiError } from "@/lib/api/errors";
import { jobQueries, useCreateJob, useUpdateJob } from "../api";
import type { Job } from "../model";
import { STATUS_META } from "../model";
import { JobForm } from "./job-form";
import { JobNotFound } from "./job-not-found";

function EditorShell({
  title,
  backHref,
  backLabel,
  children,
}: {
  title: string;
  backHref: string;
  backLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {backLabel}
      </Link>
      <h1 className="mt-4 mb-6 text-2xl font-semibold tracking-tight">
        {title}
      </h1>
      {children}
    </div>
  );
}

export function JobCreate() {
  const router = useRouter();
  const create = useCreateJob();

  return (
    <EditorShell title="New job" backHref="/jobs" backLabel="All jobs">
      <JobForm
        submitLabel="Create job"
        cancelHref="/jobs"
        onSubmit={async (request) => {
          const job = await create.mutateAsync(request);
          toast.success(`${job.reference} created`, {
            description: "It starts as a draft.",
          });
          router.push(`/jobs/${job.id}`);
        }}
      />
    </EditorShell>
  );
}

export function JobEdit({ id }: { id: string }) {
  const router = useRouter();
  const {
    data: job,
    error,
    isPending,
    isFetching,
    refetch,
  } = useQuery(jobQueries.detail(id));
  const update = useUpdateJob(id);
  // The form edits a snapshot: live updates refresh `job` in the background, and swapping the
  // form's data out from under the user would discard their unsaved edits.
  const [editing, setEditing] = useState<Job | null>(null);
  if (job && (!editing || editing.id !== job.id)) {
    setEditing(job);
  }
  const reloadLatest = async () => {
    const { data } = await refetch();
    if (data) {
      setEditing(data);
    }
  };

  if (isPending) {
    return (
      <EditorShell
        title="Edit job"
        backHref={`/jobs/${id}`}
        backLabel="Back to job"
      >
        <div role="status" className="space-y-4">
          <span className="sr-only">Loading job…</span>
          <Skeleton className="h-9" />
          <Skeleton className="h-24" />
          <Skeleton className="h-72" />
        </div>
      </EditorShell>
    );
  }

  if (error && !job) {
    return isApiError(error, 404) ? (
      <JobNotFound />
    ) : (
      <EditorShell
        title="Edit job"
        backHref={`/jobs/${id}`}
        backLabel="Back to job"
      >
        <QueryError
          error={error}
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      </EditorShell>
    );
  }

  const current = editing ?? job;
  const changedElsewhere = editing !== null && job.version !== editing.version;

  return (
    <EditorShell
      title={`Edit ${current.reference}`}
      backHref={`/jobs/${id}`}
      backLabel="Back to job"
    >
      {changedElsewhere && job.canEdit && (
        <div
          role="status"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <span>
            Someone else changed this job while you were editing. Saving now
            will ask you to reload.
          </span>
          <button
            type="button"
            onClick={() => setEditing(job)}
            className="font-medium underline underline-offset-2"
          >
            Load their changes
          </button>
        </div>
      )}
      {job.canEdit ? (
        <JobForm
          // Remount with fresh values only when the user chooses to load the latest version.
          key={current.version}
          job={current}
          submitLabel="Save changes"
          cancelHref={`/jobs/${id}`}
          onReload={() => void reloadLatest()}
          onSubmit={async (request) => {
            const saved = await update.mutateAsync({
              ...request,
              version: current.version,
            });
            toast.success(`${saved.reference} saved`);
            router.push(`/jobs/${id}`);
          }}
        />
      ) : (
        <p className="rounded-lg border bg-background px-4 py-3 text-sm text-muted-foreground">
          {job.reference} is {STATUS_META[job.status].label.toLowerCase()}, so
          it can no longer be edited.
        </p>
      )}
    </EditorShell>
  );
}
