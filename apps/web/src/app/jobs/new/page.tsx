import type { Metadata } from "next";
import { JobCreate } from "@/features/jobs/components/job-editor";

export const metadata: Metadata = { title: "New job" };

export default function NewJobPage() {
  return <JobCreate />;
}
