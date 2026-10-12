import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { rankLocations } from "@/lib/ai/recommend";
import type { NearbyLocation, RankedLocation, SearchFilters, UserPreferences } from "@/lib/types";

export const DEFAULT_FILTERS: SearchFilters = {
  place: null,
  lat: null,
  lng: null,
  radius_m: 2000,
  duration_hours: 2,
  arrive_at: null,
  max_price_per_hour: null,
  max_total_price: null,
  covered: null,
  ev_charging: null,
  accessible: null,
  open_now: false,
  types: null,
  sort: "best",
};

export async function searchParking(
  supabase: SupabaseClient,
  filters: SearchFilters & { lat: number; lng: number },
  prefs: UserPreferences = {},
  limit = 40,
): Promise<{ results: RankedLocation[]; widened: boolean }> {
  const run = async (radius: number) => {
    const { data, error } = await supabase.rpc("nearby_locations", {
      p_lat: filters.lat,
      p_lng: filters.lng,
      p_radius_m: radius,
      p_arrive_at: filters.arrive_at ?? new Date().toISOString(),
      p_max_price: filters.max_price_per_hour,
      p_covered: filters.covered,
      p_ev: filters.ev_charging,
      p_accessible: filters.accessible,
      p_open_now: filters.open_now,
      p_types: filters.types,
      p_limit: limit,
    });
    if (error) throw error;
    return ((data ?? []) as NearbyLocation[]).map(normalizeRow);
  };

  let rows = await run(filters.radius_m);
  let widened = false;
  // Nothing close by? Look a bit further rather than showing an empty screen.
  if (rows.length === 0 && filters.radius_m < 8000) {
    rows = await run(Math.min(8000, filters.radius_m * 3));
    widened = rows.length > 0;
  }
  return { results: rankLocations(rows, filters, prefs), widened };
}

/** PostgREST returns numerics as strings; normalise once here. */
function normalizeRow(r: NearbyLocation): NearbyLocation {
  return {
    ...r,
    hourly_price: Number(r.hourly_price),
    rating: r.rating === null ? null : Number(r.rating),
    predicted_rate: Number(r.predicted_rate),
    free_probability: Number(r.free_probability),
    distance_m: Number(r.distance_m),
  };
}
