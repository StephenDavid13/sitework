"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, LocateFixed, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { jobQueries } from "../api";
import {
  JOB_PRIORITIES,
  JOB_STATUSES,
  PRIORITY_META,
  SORT_LABELS,
  STATUS_META,
  type JobSort,
} from "../model";
import {
  hasActiveFilters,
  NEAR_ME_RADIUS_KM,
  useJobFilters,
  type JobFilters as Filters,
} from "../search-params";

type SetFilters = ReturnType<typeof useJobFilters>[1];

export function JobFilters({
  filters,
  setFilters,
}: {
  filters: Filters;
  setFilters: SetFilters;
}) {
  const stats = useQuery(jobQueries.stats());
  const counts = new Map(
    stats.data?.byStatus.map((row) => [row.status, row.count]),
  );

  const toggleStatus = (status: (typeof JOB_STATUSES)[number]) => {
    const next = filters.status.includes(status)
      ? filters.status.filter((s) => s !== status)
      : [...filters.status, status];
    void setFilters({ status: next.length ? next : null, page: null });
  };

  const sortOptions: JobSort[] = filters.near
    ? ["Distance", "Updated", "Scheduled", "Priority"]
    : ["Updated", "Scheduled", "Priority"];

  return (
    <div className="flex flex-col gap-3">
      <SearchBox
        value={filters.q}
        onSearch={(q) => setFilters({ q: q || null, page: null })}
      />

      <div
        role="group"
        aria-label="Filter by status"
        className="flex flex-wrap gap-1.5"
      >
        {JOB_STATUSES.map((status) => {
          const active = filters.status.includes(status);
          return (
            <button
              key={status}
              type="button"
              aria-pressed={active}
              onClick={() => toggleStatus(status)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "bg-background text-foreground hover:bg-muted",
              )}
            >
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: STATUS_META[status].color }}
              />
              {STATUS_META[status].label}
              {counts.has(status) && (
                <span
                  className={cn(
                    "tabular-nums",
                    active ? "opacity-70" : "text-muted-foreground",
                  )}
                >
                  {counts.get(status)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="priority-filter">
          Priority
        </label>
        <NativeSelect
          id="priority-filter"
          className="w-36"
          value={filters.priority[0] ?? ""}
          onChange={(event) => {
            const value = event.target.value as
              (typeof JOB_PRIORITIES)[number] | "";
            void setFilters({ priority: value ? [value] : null, page: null });
          }}
        >
          <option value="">Any priority</option>
          {JOB_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_META[priority].label} priority
            </option>
          ))}
        </NativeSelect>

        <label className="sr-only" htmlFor="sort-jobs">
          Sort by
        </label>
        <NativeSelect
          id="sort-jobs"
          className="w-48"
          value={
            filters.sort && sortOptions.includes(filters.sort)
              ? filters.sort
              : sortOptions[0]
          }
          onChange={(event) =>
            setFilters({ sort: event.target.value as JobSort, page: null })
          }
        >
          {sortOptions.map((sort) => (
            <option key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </option>
          ))}
        </NativeSelect>

        <NearMeButton
          active={Boolean(filters.near)}
          onLocate={(lat, lng) =>
            setFilters({
              near: `${lat.toFixed(5)},${lng.toFixed(5)}`,
              sort: "Distance",
              page: null,
            })
          }
        />
      </div>

      {(filters.near || filters.area || hasActiveFilters(filters)) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.near && (
            <FilterChip
              onRemove={() =>
                setFilters({ near: null, sort: null, page: null })
              }
            >
              Within {NEAR_ME_RADIUS_KM} km of you
            </FilterChip>
          )}
          {filters.area && (
            <FilterChip onRemove={() => setFilters({ area: null, page: null })}>
              In the selected map area
            </FilterChip>
          )}
          <Button
            variant="link"
            size="xs"
            className="text-muted-foreground"
            onClick={() =>
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
          >
            Clear all filters
          </Button>
        </div>
      )}
    </div>
  );
}

function SearchBox({
  value,
  onSearch,
}: {
  value: string;
  onSearch: (q: string) => void;
}) {
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);

  // Keep in step with the URL (back/forward, "clear all") by adjusting state during render.
  if (value !== synced) {
    setSynced(value);
    setText(value);
  }

  // Debounce so typing doesn't fire a request per keystroke.
  useEffect(() => {
    if (text.trim() === value) {
      return;
    }
    const timer = setTimeout(() => onSearch(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text, value, onSearch]);

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        aria-label="Search jobs"
        placeholder="Search title, site, address, assignee or JOB-1042"
        className="pl-8"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
    </div>
  );
}

function NearMeButton({
  active,
  onLocate,
}: {
  active: boolean;
  onLocate: (lat: number, lng: number) => void;
}) {
  const [locating, setLocating] = useState(false);

  const locate = () => {
    if (!("geolocation" in navigator)) {
      toast.error("Your browser can't share its location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onLocate(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        setLocating(false);
        toast.error("We couldn't get your location", {
          description: error.message,
        });
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  return (
    <Button
      variant={active ? "secondary" : "outline"}
      onClick={locate}
      disabled={locating}
      aria-pressed={active}
    >
      {locating ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        <LocateFixed aria-hidden />
      )}
      Near me
    </Button>
  );
}

function FilterChip({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-muted pr-1 pl-2.5 text-xs font-medium">
      {children}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <X className="size-3" aria-hidden />
        <span className="sr-only">Remove filter: {children}</span>
      </button>
    </span>
  );
}
