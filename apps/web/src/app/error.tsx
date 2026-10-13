"use client";

import { Button } from "@/components/ui/button";

/** Last-resort boundary for unexpected rendering errors. */
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center"
    >
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The page hit an unexpected error. Try again, and if it keeps happening,
        reload the page.
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
