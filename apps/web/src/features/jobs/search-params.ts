"use client";

import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import type { JobListParams, JobMapParams } from "./api";
import { JOB_PRIORITIES, JOB_SORTS, JOB_STATUSES } from "./model";

export const PAGE_SIZE = 20;
export const NEAR_ME_RADIUS_KM = 10;

/** Everything about the jobs view lives in the URL, so it survives reloads and can be shared. */
export const jobFilterParsers = {
  q: parseAsString.withDefault(""),
  status: parseAsArrayOf(parseAsStringLiteral(JOB_STATUSES)).withDefault([]),
  priority: parseAsArrayOf(parseAsStringLiteral(JOB_PRIORITIES)).withDefault(
    [],
  ),
  sort: parseAsStringLiteral(JOB_SORTS),
  page: parseAsInteger.withDefault(1),
  /** "Search this area": minLng,minLat,maxLng,maxLat. */
  area: parseAsString,
  /** "Near me": lat,lng. */
  near: parseAsString,
  /** Selected job (highlighted in the list and on the map). */
  job: parseAsString,
};

export function useJobFilters() {
  return useQueryStates(jobFilterParsers, { history: "replace" });
}

export type JobFilters = ReturnType<typeof useJobFilters>[0];

export function parseNear(
  near: string | null,
): { lat: number; lng: number } | null {
  const [lat, lng] = (near ?? "").split(",").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) && near
    ? { lat, lng }
    : null;
}

export function hasActiveFilters(filters: JobFilters): boolean {
  return Boolean(
    filters.q ||
    filters.status.length ||
    filters.priority.length ||
    filters.area ||
    filters.near,
  );
}

export function toListParams(filters: JobFilters): JobListParams {
  const near = parseNear(filters.near);
  return {
    q: filters.q || undefined,
    status: filters.status.length ? filters.status : undefined,
    priority: filters.priority.length ? filters.priority : undefined,
    bbox: filters.area ?? undefined,
    nearLat: near?.lat,
    nearLng: near?.lng,
    radiusKm: near ? NEAR_ME_RADIUS_KM : undefined,
    sort:
      filters.sort === "Distance" && !near
        ? undefined
        : (filters.sort ?? undefined),
    page: filters.page,
    pageSize: PAGE_SIZE,
  };
}

export function toMapParams(
  filters: JobFilters,
  viewport: string | null,
): JobMapParams {
  return {
    q: filters.q || undefined,
    status: filters.status.length ? filters.status : undefined,
    priority: filters.priority.length ? filters.priority : undefined,
    bbox: viewport ?? undefined,
  };
}
