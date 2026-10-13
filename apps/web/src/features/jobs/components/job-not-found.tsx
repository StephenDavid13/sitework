import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function JobNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
      <FileQuestion className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="mt-4 text-xl font-semibold">Job not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This job doesn&apos;t exist, or it was deleted. Check the link, or find
        it in the job list.
      </p>
      <Button className="mt-6" asChild>
        <Link href="/jobs">Back to jobs</Link>
      </Button>
    </div>
  );
}
