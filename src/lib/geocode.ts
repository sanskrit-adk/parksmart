import { publicEnv } from "@/lib/env";

export interface GeocodeResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface MapboxFeature {
  id: string;
  geometry: { coordinates: [number, number] };
  properties: { name?: string; full_address?: string; place_formatted?: string; mapbox_id?: string };
}

/**
 * Forward geocoding via Mapbox Geocoding v6, biased toward the Bay Area (or
 * the user's position when known). Works from both server and browser since
 * the Mapbox public token is URL-restricted, not secret.
 */
export async function geocode(
  query: string,
  opts: { proximity?: { lat: number; lng: number }; limit?: number; signal?: AbortSignal } = {},
): Promise<GeocodeResult[]> {
  const token = publicEnv.mapboxToken;
  if (!token || !query.trim()) return [];
  const params = new URLSearchParams({
    q: query,
    access_token: token,
    country: "us",
    limit: String(opts.limit ?? 5),
    autocomplete: "true",
    proximity: opts.proximity ? `${opts.proximity.lng},${opts.proximity.lat}` : "-122.27,37.65",
    bbox: "-123.2,36.9,-121.2,38.6",
  });
  const res = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params}`, { signal: opts.signal });
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const json = (await res.json()) as { features: MapboxFeature[] };
  return json.features.map((f) => ({
    id: f.properties.mapbox_id ?? f.id,
    name: f.properties.name ?? f.properties.full_address ?? query,
    address: f.properties.full_address ?? f.properties.place_formatted ?? "",
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const token = publicEnv.mapboxToken;
  if (!token) return null;
  const params = new URLSearchParams({ longitude: String(lng), latitude: String(lat), access_token: token, limit: "1" });
  const res = await fetch(`https://api.mapbox.com/search/geocode/v6/reverse?${params}`);
  if (!res.ok) return null;
  const json = (await res.json()) as { features: MapboxFeature[] };
  return json.features[0]?.properties.full_address ?? null;
}
