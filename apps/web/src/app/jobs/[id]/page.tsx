import type { Metadata } from "next";
import { Suspense } from "react";
import {
  JobDetail,
  JobDetailSkeleton,
} from "@/features/jobs/components/job-detail";

export const metadata: Metadata = { title: "Job" };

export default function JobPage({ params }: PageProps<"/jobs/[id]">) {
  // Params are request-time data, so they're read inside Suspense (Cache Components).
  return (
    <Suspense fallback={<JobDetailSkeleton />}>
      <JobDetailRoute params={params} />
    </Suspense>
  );
}

async function JobDetailRoute({
  params,
}: {
  params: PageProps<"/jobs/[id]">["params"];
}) {
  const { id } = await params;
  return <JobDetail id={id} />;
}
