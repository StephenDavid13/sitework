"use client";

import { MapIcon } from "lucide-react";
import dynamic from "next/dynamic";

/** MapLibre needs WebGL and `window`, so the maps load on the client only. */
function MapPlaceholder() {
  return (
    <div className="flex size-full animate-pulse items-center justify-center bg-muted">
      <MapIcon className="size-6 text-muted-foreground" aria-hidden />
      <span className="sr-only">Loading map…</span>
    </div>
  );
}

export const JobsMap = dynamic(
  () => import("./jobs-map").then((m) => m.JobsMap),
  {
    ssr: false,
    loading: MapPlaceholder,
  },
);

export const LocationMap = dynamic(
  () => import("./location-map").then((m) => m.LocationMap),
  {
    ssr: false,
    loading: MapPlaceholder,
  },
);
