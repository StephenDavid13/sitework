"use client";

import { useQuery } from "@tanstack/react-query";
import { List, Loader2, Map as MapIcon, ScanSearch } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { jobQueries } from "../api";
import {
  hasActiveFilters,
  toListParams,
  toMapParams,
  useJobFilters,
} from "../search-params";
import { JobFilters } from "./job-filters";
import { JobList } from "./job-list";
import { JobsMap } from "./maps";

/** List and map side by side on desktop; switchable tabs on small screens. */
export function JobsWorkspace() {
  const [filters, setFilters] = useJobFilters();
  const [viewport, setViewport] = useState<string | null>(null);
  const [userMoved, setUserMoved] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");

  const mapQuery = useQuery(jobQueries.map(toMapParams(filters, viewport)));

  const select = useCallback(
    (id: string | null) => void setFilters({ job: id }),
    [setFilters],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="flex gap-1 border-b p-2 md:hidden"
        role="tablist"
        aria-label="View"
      >
        {(["list", "map"] as const).map((view) => (
          <button
            key={view}
            type="button"
            role="tab"
            aria-selected={mobileView === view}
            onClick={() => setMobileView(view)}
            className={cn(
              "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-medium",
              mobileView === view
                ? "bg-muted text-foreground"
                : "text-muted-foreground",
            )}
          >
            {view === "list" ? (
              <List className="size-4" aria-hidden />
            ) : (
              <MapIcon className="size-4" aria-hidden />
            )}
            {view === "list" ? "List" : "Map"}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]">
        <aside
          className={cn(
            "flex min-h-0 flex-col gap-5 overflow-y-auto p-4 md:border-r",
            mobileView === "map" && "hidden md:flex",
          )}
        >
          <h1 className="text-xl font-semibold tracking-tight">Jobs</h1>
          <JobFilters filters={filters} setFilters={setFilters} />
          <JobList
            params={toListParams(filters)}
            selectedId={filters.job}
            onSelect={(id) => {
              select(id);
              if (!window.matchMedia("(min-width: 768px)").matches) {
                setMobileView("map");
              }
            }}
            onPageChange={(page) => setFilters({ page })}
            filtersActive={hasActiveFilters(filters)}
            onClearFilters={() =>
              setFilters({
                q: null,
                status: null,
                priority: null,
                area: null,
                near: null,
                sort: null,
                page: null,
              })
            }
          />
        </aside>

        <section
          aria-label="Map of jobs"
          className={cn(
            "relative h-[calc(100dvh-7.5rem)] md:h-auto",
            mobileView === "list" && "hidden md:block",
          )}
        >
          <JobsMap
            points={mapQuery.data?.items ?? []}
            selectedId={filters.job}
            onSelect={select}
            onViewportChange={(bbox, byUser) => {
              setViewport(bbox);
              setUserMoved((moved) => moved || byUser);
            }}
          />

          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-14">
            <div className="pointer-events-auto flex flex-col items-center gap-2">
              {mapQuery.isFetching && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-background/95 px-3 py-1 text-xs shadow-sm ring-1 ring-border">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  Loading jobs…
                </span>
              )}
              {mapQuery.error && !mapQuery.isFetching && (
                <div
                  role="alert"
                  className="flex items-center gap-3 rounded-lg bg-background/95 px-3 py-2 text-xs shadow-sm ring-1 ring-destructive/40"
                >
                  <span>
                    <span className="font-medium">
                      Map couldn&apos;t load jobs.
                    </span>{" "}
                    {describeError(mapQuery.error).detail}
                  </span>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => mapQuery.refetch()}
                  >
                    Retry
                  </Button>
                </div>
              )}
              {mapQuery.data?.truncated && (
                <span className="rounded-full bg-background/95 px-3 py-1 text-xs shadow-sm ring-1 ring-border">
                  Showing the first {mapQuery.data.items.length} jobs. Zoom in
                  or filter to see more.
                </span>
              )}
            </div>
          </div>

          {userMoved && viewport && viewport !== filters.area && (
            <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center">
              <Button
                className="pointer-events-auto shadow-md"
                onClick={() => {
                  void setFilters({ area: viewport, page: null });
                  setMobileView("list");
                }}
              >
                <ScanSearch aria-hidden />
                Search this area
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
