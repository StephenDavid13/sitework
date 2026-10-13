import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="mt-2 text-xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        That page doesn&apos;t exist.
      </p>
      <Button className="mt-6" asChild>
        <Link href="/jobs">Go to jobs</Link>
      </Button>
    </div>
  );
}
