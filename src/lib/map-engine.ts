"use client";

import type mapboxgl from "mapbox-gl";
import { publicEnv } from "@/lib/env";

/**
 * Mapbox GL when NEXT_PUBLIC_MAPBOX_TOKEN is set; otherwise MapLibre GL (the
 * open-source fork with the same API) with free OpenFreeMap tiles, so the map
 * works with no account at all.
 */
export const usingMapbox = Boolean(publicEnv.mapboxToken);

export type MapEngine = typeof mapboxgl;

export async function loadMapEngine(): Promise<MapEngine> {
  if (usingMapbox) {
    const gl = (await import("mapbox-gl")).default;
    gl.accessToken = publicEnv.mapboxToken;
    return gl;
  }
  // MapLibre 6 is ESM-only with named exports (no default). Its tile worker is
  // served from /public (copied there by scripts/copy-map-worker.mjs).
  const ml = await import("maplibre-gl");
  ml.setWorkerUrl("/maplibre-gl-worker.mjs");
  return ml as unknown as MapEngine;
}

export const MAP_STYLES = usingMapbox
  ? { light: "mapbox://styles/mapbox/light-v11", dark: "mapbox://styles/mapbox/dark-v11", streets: "mapbox://styles/mapbox/streets-v12" }
  : {
      light: "https://tiles.openfreemap.org/styles/positron",
      dark: "https://tiles.openfreemap.org/styles/dark",
      streets: "https://tiles.openfreemap.org/styles/liberty",
    };

export const LABEL_FONT = usingMapbox ? ["DIN Pro Bold", "Arial Unicode MS Bold"] : ["Noto Sans Bold"];
