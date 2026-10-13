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
 * Forward geocoding (worldwide), biased toward the user's position when known.
 * Mapbox Geocoding v6 when a token is set, otherwise Photon (OpenStreetMap). Works from both server and browser since
 * the Mapbox public token is URL-restricted, not secret.
 */
export async function geocode(
  query: string,
  opts: { proximity?: { lat: number; lng: number }; limit?: number; signal?: AbortSignal } = {},
): Promise<GeocodeResult[]> {
  const token = publicEnv.mapboxToken;
  if (!query.trim()) return [];
  if (!token) return photon(query, opts);
  const params = new URLSearchParams({
    q: query,
    access_token: token,
    limit: String(opts.limit ?? 5),
    autocomplete: "true",
    proximity: opts.proximity ? `${opts.proximity.lng},${opts.proximity.lat}` : "ip",
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

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: { osm_type?: string; osm_id?: number; name?: string; housenumber?: string; street?: string; city?: string; state?: string; postcode?: string; country?: string };
}

/** Free OpenStreetMap geocoder (photon.komoot.io) used when no Mapbox token is set. */
async function photon(query: string, opts: { proximity?: { lat: number; lng: number }; limit?: number; signal?: AbortSignal }): Promise<GeocodeResult[]> {
  const params = new URLSearchParams({ q: query, limit: String(opts.limit ?? 5), lang: "en" });
  if (opts.proximity) {
    params.set("lat", String(opts.proximity.lat));
    params.set("lon", String(opts.proximity.lng));
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal: opts.signal });
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const json = (await res.json()) as { features: PhotonFeature[] };
  return json.features.map((f, i) => {
    const p = f.properties;
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    const address = [street || (p.name !== p.city ? p.name : ""), p.city, p.state, p.country].filter(Boolean).join(", ");
    return {
      id: `${p.osm_type ?? "x"}${p.osm_id ?? i}`,
      name: p.name ?? (street || query),
      address,
      lng: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    };
  });
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
