"use client";

import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type GeocodeResult = components["schemas"]["GeocodeResult"];

/** Rounded so panning the map slightly doesn't defeat the cache. */
const round = (value: number, places: number) => Number(value.toFixed(places));

export const geocodeQueries = {
  search: (q: string, near: { latitude: number; longitude: number } | null) =>
    queryOptions({
      queryKey: [
        "geocode",
        "search",
        q,
        near && round(near.latitude, 2),
        near && round(near.longitude, 2),
      ],
      queryFn: ({ signal }) =>
        unwrap(
          api.GET("/api/geocode/search", {
            params: {
              query: {
                q,
                nearLat: near ? round(near.latitude, 2) : undefined,
                nearLng: near ? round(near.longitude, 2) : undefined,
              },
            },
            signal,
          }),
        ),
      staleTime: 60 * 60 * 1000,
      placeholderData: keepPreviousData,
      retry: false,
    }),
  reverse: (latitude: number, longitude: number) =>
    queryOptions({
      queryKey: ["geocode", "reverse", round(latitude, 5), round(longitude, 5)],
      queryFn: ({ signal }) =>
        unwrap(
          api.GET("/api/geocode/reverse", {
            params: {
              query: { lat: round(latitude, 5), lng: round(longitude, 5) },
            },
            signal,
          }),
        ),
      staleTime: 60 * 60 * 1000,
      retry: false,
    }),
};
