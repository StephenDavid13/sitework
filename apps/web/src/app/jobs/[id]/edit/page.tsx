import type { Metadata } from "next";
import { Suspense } from "react";
import { JobEdit } from "@/features/jobs/components/job-editor";

export const metadata: Metadata = { title: "Edit job" };

export default function EditJobPage({ params }: PageProps<"/jobs/[id]/edit">) {
  return (
    <Suspense>
      <JobEditRoute params={params} />
    </Suspense>
  );
}

async function JobEditRoute({
  params,
}: {
  params: PageProps<"/jobs/[id]/edit">["params"];
}) {
  const { id } = await params;
  return <JobEdit id={id} />;
}
