import { z } from "zod";
import { ApiError, handler, ok, parseJson } from "@/lib/api";
import { parseSearchQuery } from "@/lib/ai/search-parser";
import { getSession } from "@/lib/auth";
import { geocode, type GeocodeResult } from "@/lib/geocode";
import { ipLocation } from "@/lib/ip-location";
import { SF_CENTER } from "@/lib/geo";
import { DEFAULT_FILTERS, searchParking } from "@/lib/search";
import type { SearchFilters } from "@/lib/types";

const schema = z.object({
  query: z.string().trim().min(2, "Tell us where you want to park").max(500),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});

// First search in a new area imports its parking from OpenStreetMap (can take ~20s).
export const maxDuration = 60;

/**
 * AI search: natural language → structured filters (LLM, strict JSON schema)
 * → geocode the destination → PostGIS search → AI ranking.
 */
export const POST = handler(async (req: Request) => {
  const body = await parseJson(req, schema);
  const { filters: parsed, engine } = await parseSearchQuery(body.query);
  // Precise browser position if shared, otherwise the visitor's approximate (IP) location.
  const gps = body.lat != null && body.lng != null ? { lat: body.lat, lng: body.lng } : null;
  const approx = gps ? null : ipLocation(req.headers);
  const userPos = gps ?? (approx ? { lat: approx.lat, lng: approx.lng } : null);

  let place: { name: string; address: string; lat: number; lng: number } | null = null;
  if (parsed.place) {
    const hits: GeocodeResult[] = await geocode(parsed.place_full_name ?? parsed.place, { proximity: userPos ?? undefined, limit: 1 }).catch(() => []);
    if (!hits[0] && parsed.place_full_name && parsed.place_full_name !== parsed.place) {
      hits.push(...(await geocode(parsed.place, { proximity: userPos ?? undefined, limit: 1 }).catch(() => [])));
    }
    if (!hits[0]) throw new ApiError(404, `We couldn't find "${parsed.place}". Try adding a street or city.`);
    place = { name: hits[0].name, address: hits[0].address, lat: hits[0].lat, lng: hits[0].lng };
  }

  const center = place ?? userPos ?? SF_CENTER;
  const filters: SearchFilters = {
    ...DEFAULT_FILTERS,
    ...parsed,
    lat: center.lat,
    lng: center.lng,
  };

  const { supabase, profile } = await getSession();
  const { results, widened, coverage } = await searchParking(supabase, { ...filters, lat: center.lat, lng: center.lng }, profile?.preferences);

  return ok({
    engine,
    summary: parsed.summary,
    filters,
    place,
    usedUserLocation: !place && Boolean(userPos),
    approximateLocation: !place && !gps && approx ? approx.city ?? "your area" : null,
    results,
    widened,
    coverage,
  });
});
