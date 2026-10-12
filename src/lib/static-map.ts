import { publicEnv } from "@/lib/env";

/** Mapbox Static Images URL — used as the photo when a location has none. */
export function staticMapUrl(lat: number, lng: number, opts: { w?: number; h?: number; zoom?: number; dark?: boolean } = {}) {
  if (!publicEnv.mapboxToken) return null;
  const { w = 800, h = 420, zoom = 16, dark = false } = opts;
  const style = dark ? "mapbox/dark-v11" : "mapbox/streets-v12";
  return `https://api.mapbox.com/styles/v1/${style}/static/pin-l-parking+14b8a6(${lng},${lat})/${lng},${lat},${zoom},0/${w}x${h}@2x?access_token=${publicEnv.mapboxToken}`;
}
