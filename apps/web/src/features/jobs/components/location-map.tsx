"use client";

import {
  Map,
  Marker,
  NavigationControl,
  type MapRef,
} from "@vis.gl/react-maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import "./maplibre-worker";
import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_CENTER } from "../model";
import { MAP_STYLE_URL } from "./map-style";

export type LatLng = { latitude: number; longitude: number };

export type LocationMapProps = {
  value: LatLng | null;
  /** When set, the map is a picker: click to drop the pin, or drag it. */
  onChange?: (value: LatLng) => void;
  color?: string;
};

export function LocationMap({
  value,
  onChange,
  color = "#18181b",
}: LocationMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [loaded, setLoaded] = useState(false);

  // Follow values typed into the coordinate fields or found by "Use my location".
  useEffect(() => {
    const map = mapRef.current;
    if (
      loaded &&
      map &&
      value &&
      !map.getBounds().contains([value.longitude, value.latitude])
    ) {
      map.easeTo({
        center: [value.longitude, value.latitude],
        zoom: Math.max(map.getZoom(), 14),
      });
    }
  }, [loaded, value]);

  const round = (n: number) => Math.round(n * 1e6) / 1e6;

  return (
    <Map
      ref={mapRef}
      mapStyle={MAP_STYLE_URL}
      initialViewState={{ ...(value ?? DEFAULT_CENTER), zoom: value ? 14 : 10 }}
      style={{ width: "100%", height: "100%" }}
      cursor={onChange ? "crosshair" : "grab"}
      onLoad={(event) => {
        setLoaded(true);
        // MapLibre opens the compact attribution on load; start it collapsed on this small map
        // (the ⓘ button keeps the OpenStreetMap credit one click away).
        event.target
          .getContainer()
          .querySelector(".maplibregl-compact-show")
          ?.classList.remove("maplibregl-compact-show");
      }}
      onClick={
        onChange
          ? (event) =>
              onChange({
                latitude: round(event.lngLat.lat),
                longitude: round(event.lngLat.lng),
              })
          : undefined
      }
      dragRotate={false}
      cooperativeGestures={!onChange}
      attributionControl={{ compact: true }}
    >
      <NavigationControl position="top-right" showCompass={false} />
      {value && (
        <Marker
          longitude={value.longitude}
          latitude={value.latitude}
          anchor="bottom"
          draggable={Boolean(onChange)}
          onDragEnd={(event) =>
            onChange?.({
              latitude: round(event.lngLat.lat),
              longitude: round(event.lngLat.lng),
            })
          }
        >
          <MapPin
            className="size-9 drop-shadow"
            fill={color}
            stroke="#ffffff"
            strokeWidth={1.5}
            aria-hidden
          />
        </Marker>
      )}
    </Map>
  );
}
