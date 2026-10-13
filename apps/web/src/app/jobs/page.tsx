import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { JobsWorkspace } from "@/features/jobs/components/jobs-workspace";

export const metadata: Metadata = { title: "Jobs" };

export default function JobsPage() {
  // The workspace reads its filters from the URL, which is only known at request time.
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <JobsWorkspace />
    </Suspense>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="grid flex-1 md:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]">
      <div role="status" className="space-y-3 p-4">
        <span className="sr-only">Loading jobs…</span>
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-8" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="hidden rounded-none md:block" />
    </div>
  );
}
