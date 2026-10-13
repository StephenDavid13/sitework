"use client";

import {
  Layer,
  Map,
  NavigationControl,
  Popup,
  Source,
  type LayerProps,
  type MapLayerMouseEvent,
  type MapRef,
} from "@vis.gl/react-maplibre";
import type { FeatureCollection, Point } from "geojson";
import type {
  ExpressionSpecification,
  GeoJSONSource,
  LngLatBounds,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./maplibre-worker";
import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_CENTER,
  JOB_STATUSES,
  STATUS_META,
  type JobMapPoint,
} from "../model";
import { StatusBadge } from "./badges";
import { MAP_STYLE_URL } from "./map-style";

const SOURCE_ID = "jobs";
const CLUSTER_LAYER = "job-clusters";
const POINT_LAYER = "job-points";
const CLUSTER_MAX_ZOOM = 13;

const statusColor = [
  "match",
  ["get", "status"],
  ...JOB_STATUSES.flatMap((status) => [status, STATUS_META[status].color]),
  "#64748b",
] as unknown as ExpressionSpecification;

const clusterLayer: LayerProps = {
  id: CLUSTER_LAYER,
  type: "circle",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": "#18181b",
    "circle-opacity": 0.85,
    "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 50, 24],
    "circle-stroke-width": 3,
    "circle-stroke-color": "#ffffff",
  },
};

const clusterCountLayer: LayerProps = {
  id: "job-cluster-count",
  type: "symbol",
  filter: ["has", "point_count"],
  layout: {
    "text-field": ["get", "point_count_abbreviated"],
    "text-font": ["Noto Sans Bold"],
    "text-size": 12,
    "text-allow-overlap": true,
  },
  paint: { "text-color": "#ffffff" },
};

const pointLayer: LayerProps = {
  id: POINT_LAYER,
  type: "circle",
  filter: ["!", ["has", "point_count"]],
  paint: {
    "circle-color": statusColor,
    "circle-radius": [
      "match",
      ["get", "priority"],
      "Urgent",
      8.5,
      "High",
      7.5,
      6.5,
    ],
    "circle-stroke-width": 2,
    "circle-stroke-color": "#ffffff",
  },
};

export type JobsMapProps = {
  points: JobMapPoint[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /**
   * Called with `minLng,minLat,maxLng,maxLat` whenever the map stops moving. `byUser` is false for
   * programmatic moves such as the initial fit.
   */
  onViewportChange: (bbox: string, byUser: boolean) => void;
};

export function JobsMap({
  points,
  selectedId,
  onSelect,
  onViewportChange,
}: JobsMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [loaded, setLoaded] = useState(false);
  const [hovering, setHovering] = useState(false);
  const fitted = useRef(false);

  const data = useMemo<FeatureCollection<Point>>(
    () => ({
      type: "FeatureCollection",
      features: points.map((point) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [point.longitude, point.latitude],
        },
        properties: {
          id: point.id,
          reference: point.reference,
          title: point.title,
          status: point.status,
          priority: point.priority,
        },
      })),
    }),
    [points],
  );

  const selected = points.find((point) => point.id === selectedId) ?? null;

  // Frame every job the first time data arrives; after that the user drives the viewport.
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map || fitted.current || points.length === 0) {
      return;
    }
    fitted.current = true;
    const lngs = points.map((p) => p.longitude);
    const lats = points.map((p) => p.latitude);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 48, maxZoom: 14, duration: 0 },
    );
  }, [loaded, points]);

  // Bring a newly selected job into view, zoomed in past clustering so its own marker shows.
  const focused = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map || !selected || focused.current === selected.id) {
      return;
    }
    focused.current = selected.id;
    map.easeTo({
      center: [selected.longitude, selected.latitude],
      zoom: Math.max(map.getZoom(), CLUSTER_MAX_ZOOM + 1),
    });
  }, [loaded, selected]);

  const handleClick = async (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature) {
      onSelect(null);
      return;
    }
    if (feature.layer.id === CLUSTER_LAYER) {
      const source = mapRef.current?.getSource<GeoJSONSource>(SOURCE_ID);
      const zoom = await source?.getClusterExpansionZoom(
        feature.properties.cluster_id as number,
      );
      const [lng, lat] = (feature.geometry as Point).coordinates;
      mapRef.current?.easeTo({ center: [lng, lat], zoom });
      return;
    }
    onSelect(feature.properties.id as string);
  };

  return (
    <Map
      ref={mapRef}
      mapStyle={MAP_STYLE_URL}
      initialViewState={{ ...DEFAULT_CENTER, zoom: 10 }}
      style={{ width: "100%", height: "100%" }}
      interactiveLayerIds={[CLUSTER_LAYER, POINT_LAYER]}
      cursor={hovering ? "pointer" : "grab"}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={handleClick}
      onLoad={() => setLoaded(true)}
      onMoveEnd={(event) =>
        onViewportChange(
          toBbox(event.target.getBounds()),
          Boolean(event.originalEvent),
        )
      }
      dragRotate={false}
    >
      <NavigationControl position="top-right" showCompass={false} />

      <Source
        id={SOURCE_ID}
        type="geojson"
        data={data}
        cluster
        clusterRadius={40}
        clusterMaxZoom={CLUSTER_MAX_ZOOM}
      >
        <Layer {...clusterLayer} />
        <Layer {...clusterCountLayer} />
        <Layer
          id="job-selected"
          type="circle"
          filter={["==", ["get", "id"], selectedId ?? ""]}
          paint={{
            "circle-radius": 13,
            "circle-color": "rgba(0,0,0,0)",
            "circle-stroke-width": 3,
            "circle-stroke-color": "#18181b",
          }}
        />
        <Layer {...pointLayer} />
      </Source>

      {selected && (
        <Popup
          longitude={selected.longitude}
          latitude={selected.latitude}
          anchor="bottom"
          offset={14}
          closeButton={false}
          closeOnClick={false}
          onClose={() => onSelect(null)}
          maxWidth="280px"
          className="job-popup"
        >
          <div className="flex flex-col gap-1.5 font-sans">
            <div className="flex items-start justify-between gap-3">
              <span className="pt-0.5 font-mono text-[11px] text-muted-foreground">
                {selected.reference}
              </span>
              <button
                type="button"
                onClick={() => onSelect(null)}
                className="-mt-1 -mr-1 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <X className="size-4" aria-hidden />
                <span className="sr-only">Close</span>
              </button>
            </div>
            <span className="text-sm leading-snug font-medium text-foreground">
              {selected.title}
            </span>
            <div className="mt-1 flex items-center justify-between gap-3">
              <StatusBadge status={selected.status} />
              <Link
                href={`/jobs/${selected.id}`}
                className="text-xs font-medium text-foreground underline underline-offset-2 hover:no-underline"
              >
                Open job
              </Link>
            </div>
          </div>
        </Popup>
      )}
    </Map>
  );
}

/** Clamped to valid coordinates: zoomed-out maps can report bounds beyond ±180°. */
function toBbox(bounds: LngLatBounds): string {
  const clamp = (value: number, limit: number) =>
    Math.max(-limit, Math.min(limit, value));
  return [
    clamp(bounds.getWest(), 180),
    clamp(bounds.getSouth(), 90),
    clamp(bounds.getEast(), 180),
    clamp(bounds.getNorth(), 90),
  ]
    .map((value) => value.toFixed(5))
    .join(",");
}
