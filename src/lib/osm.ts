/**
 * OpenStreetMap (Overpass API) → parking_locations rows. Shared by the seed
 * script and the on-demand coverage loader, so it must stay free of
 * Next.js-only imports.
 */
import tzLookup from "@photostructure/tz-lookup";
import { parseOsmOpeningHours } from "./opening-hours";

export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const UA = "ParkSmart/1.0 (open-data parking finder)";

export interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export type LocType = "garage" | "lot" | "street" | "private";

export interface LocationRow {
  external_id: string;
  name: string;
  address: string | null;
  city: string | null;
  geom: string;
  type: LocType;
  covered: boolean;
  ev_charging: boolean;
  accessible: boolean;
  total_spots: number;
  capacity_estimated: boolean;
  hourly_price: number;
  price_estimated: boolean;
  source: "osm" | "sfmta";
  opening_hours: unknown;
  timezone: string;
  description: string | null;
  osm_tags: Record<string, string> | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs an Overpass query, rotating through public mirrors on failure. */
export async function overpass(query: string, opts: { attempts?: number; timeoutMs?: number; backoffMs?: number; log?: (m: string) => void } = {}): Promise<OsmElement[]> {
  const { attempts = 4, timeoutMs = 180_000, backoffMs = 5000, log } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const url = OVERPASS_ENDPOINTS[attempt % OVERPASS_ENDPOINTS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      if (!res.ok || !text.trimStart().startsWith("{")) throw new Error(`${url} → ${res.status}: ${text.slice(0, 120).replace(/\s+/g, " ")}`);
      return (JSON.parse(text) as { elements: OsmElement[] }).elements;
    } catch (err) {
      lastErr = err;
      log?.(`Overpass attempt ${attempt + 1} failed (${(err as Error).message})`);
      if (attempt < attempts - 1 && backoffMs) await sleep(backoffMs * (attempt + 1));
    }
  }
  throw lastErr;
}

/**
 * Sends the same query to every mirror at once and returns the first good
 * answer. Used for interactive requests: shared cloud IPs often wait in one
 * mirror's queue while another answers in seconds.
 */
export async function overpassRace(query: string, timeoutMs = 25_000): Promise<OsmElement[]> {
  const controllers = OVERPASS_ENDPOINTS.map(() => new AbortController());
  const timer = setTimeout(() => controllers.forEach((c) => c.abort()), timeoutMs);
  try {
    return await Promise.any(
      OVERPASS_ENDPOINTS.map(async (url, i) => {
        const res = await fetch(url, {
          method: "POST",
          headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body: new URLSearchParams({ data: query }),
          signal: controllers[i].signal,
        });
        const text = await res.text();
        if (!res.ok || !text.trimStart().startsWith("{")) throw new Error(`${url} → ${res.status}`);
        const parsed = JSON.parse(text) as { elements: OsmElement[]; remark?: string };
        // Overpass reports server-side timeouts as a 200 with a "remark"; treat as failure.
        if (parsed.remark && /timed out|runtime error/i.test(parsed.remark)) throw new Error(`${url} → ${parsed.remark}`);
        controllers.forEach((c, k) => k !== i && c.abort());
        return parsed.elements;
      }),
    );
  } catch (err) {
    const reasons = err instanceof AggregateError ? err.errors.map((e) => (e as Error).message).join("; ") : String(err);
    throw new Error(`All Overpass mirrors failed: ${reasons}`);
  } finally {
    clearTimeout(timer);
  }
}

export function parkingQuery(s: number, w: number, n: number, e: number, timeoutSec = 90) {
  const bbox = `${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)}`;
  // Skip clearly non-public parking server-side to keep responses small.
  return `[out:json][timeout:${timeoutSec}];nwr["amenity"="parking"]["access"!~"^(private|no|customers|delivery|employees|permit|residents)$"](${bbox});out center tags;`;
}

const DOWNTOWN_SF = { lat: 37.788, lng: -122.4075 };
function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const inSF = (lat: number, lng: number) => lat > 37.7 && lat < 37.835 && lng > -122.52 && lng < -122.355;

export function timezoneAt(lat: number, lng: number) {
  try {
    return tzLookup(lat, lng);
  } catch {
    return "UTC";
  }
}

function parseCharge(charge?: string): number | null {
  if (!charge) return null;
  const m = charge.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:USD)?\s*\/\s*(?:h|hr|hour)\b/i) ?? charge.match(/(\d+(?:\.\d+)?)\s*USD\s*\/\s*hour/i);
  return m ? Number(m[1]) : null;
}

const BLOCKED_ACCESS = ["private", "no", "customers", "delivery", "employees", "permit", "residents", "agricultural", "forestry"];

/**
 * @param relaxed keep unnamed public lots too (used for on-demand areas where
 *   OSM rarely names small lots); the seed keeps only identifiable places.
 */
export function osmToRow(el: OsmElement, { relaxed = false }: { relaxed?: boolean } = {}): LocationRow | null {
  const t = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat == null || lng == null) return null;
  if (BLOCKED_ACCESS.includes(t.access ?? "")) return null;
  const parking = t.parking ?? "";
  const capacity = Number.parseInt(t.capacity ?? "", 10);
  const notable = Boolean(t.name) || capacity >= 10 || ["multi-storey", "underground", "rooftop"].includes(parking);
  if (!notable && !relaxed) return null;
  // Tiny roadside bits are noise even in relaxed mode.
  if (!notable && ["street_side", "lane", "on_kerb", "half_on_kerb"].includes(parking) && !(capacity >= 4)) return null;

  const type: LocType = ["multi-storey", "underground", "rooftop"].includes(parking)
    ? "garage"
    : ["street_side", "lane", "on_kerb", "half_on_kerb"].includes(parking)
      ? "street"
      : "lot";
  const covered = ["multi-storey", "underground"].includes(parking) || t.covered === "yes";
  const ev = Number.parseInt(t["capacity:charging"] ?? "0", 10) > 0 || t["capacity:charging"] === "yes";
  const accessible = t.wheelchair === "yes" || Number.parseInt(t["capacity:disabled"] ?? "0", 10) > 0 || t["capacity:disabled"] === "yes";

  const capEstimate = type === "garage" ? 250 : type === "street" ? 12 : notable ? 40 : 20;
  const total = Number.isFinite(capacity) && capacity > 0 ? Math.min(capacity, 5000) : capEstimate;

  const listed = parseCharge(t.charge);
  let price: number;
  let priceEstimated = false;
  if (t.fee === "no") price = 0;
  else if (listed !== null) price = listed;
  else {
    priceEstimated = true;
    const sf = inSF(lat, lng);
    const downtown = km({ lat, lng }, DOWNTOWN_SF) < 2.5;
    price = type === "garage" ? (downtown ? 7 : sf ? 4.5 : 3) : downtown ? 5 : sf ? 3.5 : 2;
  }

  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  const city = t["addr:city"] ?? (inSF(lat, lng) ? "San Francisco" : null);
  const typeLabel = type === "garage" ? "Parking garage" : type === "street" ? "Street parking" : "Parking lot";
  const name = t.name ?? t["name:en"] ?? (t["addr:street"] ? `${typeLabel} on ${t["addr:street"]}` : typeLabel);

  return {
    external_id: `osm:${el.type}/${el.id}`,
    name: name.slice(0, 120),
    address: street ? [street, city].filter(Boolean).join(", ") : null,
    city,
    geom: `SRID=4326;POINT(${lng} ${lat})`,
    type,
    covered,
    ev_charging: ev,
    accessible,
    total_spots: total,
    capacity_estimated: !(Number.isFinite(capacity) && capacity > 0),
    hourly_price: price,
    price_estimated: priceEstimated,
    source: "osm",
    opening_hours: parseOsmOpeningHours(t.opening_hours),
    timezone: timezoneAt(lat, lng),
    description: t.operator ? `Operated by ${t.operator}.` : null,
    osm_tags: t,
  };
}
