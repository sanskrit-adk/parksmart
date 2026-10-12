"use client";

import dynamic from "next/dynamic";

/** Mapbox GL is ~1 MB: load it only on the client, after first paint. */
export const LazyParkingMap = dynamic(() => import("@/components/map/parking-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-muted" aria-label="Loading map">
      <div className="size-10 animate-spin rounded-full border-4 border-teal/30 border-t-teal" />
    </div>
  ),
});

export type { Bounds, ParkingMapProps } from "@/components/map/parking-map";
