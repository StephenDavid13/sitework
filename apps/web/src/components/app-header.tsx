"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPinned, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { useJobLiveUpdates } from "@/features/jobs/live-updates";
import { statusQuery } from "@/features/system/api-status";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/jobs", label: "Jobs" },
  { href: "/status", label: "Status" },
];

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
      <Link
        href="/jobs"
        className="flex items-center gap-2 font-semibold tracking-tight sm:mr-3"
      >
        <span className="grid size-7 place-items-center rounded-md bg-foreground text-background">
          <MapPinned className="size-4" aria-hidden />
        </span>
        <span className="hidden min-[400px]:inline">Sitework</span>
      </Link>
      {/* The current path is request-time data, so the active state streams in (Cache Components). */}
      <Suspense fallback={<MainNav pathname={null} />}>
        <ActiveMainNav />
      </Suspense>
      <div className="ml-auto flex items-center gap-3">
        <ApiIndicator />
        <Button size="sm" asChild>
          <Link href="/jobs/new">
            <Plus aria-hidden />
            <span className="sr-only sm:not-sr-only">New job</span>
          </Link>
        </Button>
      </div>
    </header>
  );
}

function ActiveMainNav() {
  return <MainNav pathname={usePathname()} />;
}

function MainNav({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Main" className="flex items-center gap-1 text-sm">
      {NAV.map((item) => {
        const active = pathname !== null && pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1.5 transition-colors hover:bg-muted",
              active ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** A quiet signal that the backend is reachable; details live on /status. */
/**
 * A quiet signal that the backend is reachable and live updates are flowing; details on /status.
 * Mounting it opens the tab's single live-update stream.
 */
function ApiIndicator() {
  const live = useJobLiveUpdates();
  const { data, error, isPending } = useQuery({
    ...statusQuery,
    refetchInterval: 60_000,
  });
  const state = isPending
    ? { color: "bg-muted-foreground/40", label: "Checking connection" }
    : error
      ? { color: "bg-red-500", label: "API unreachable" }
      : data.database !== "Healthy"
        ? { color: "bg-amber-500", label: "Database unavailable" }
        : live === "live"
          ? { color: "bg-green-500 animate-pulse", label: "Live" }
          : live === "reconnecting"
            ? { color: "bg-amber-500", label: "Reconnecting live updates" }
            : { color: "bg-green-500", label: "All systems normal" };

  return (
    <Link
      href="/status"
      title={
        live === "live"
          ? "Changes made by others appear automatically"
          : undefined
      }
      className="hidden items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted sm:inline-flex"
    >
      <span aria-hidden className={cn("size-2 rounded-full", state.color)} />
      {state.label}
    </Link>
  );
}
