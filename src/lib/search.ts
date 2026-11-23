import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { rankLocations } from "@/lib/ai/recommend";
import { ensureCoverageAround } from "@/lib/coverage";
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
  /** How long to wait for a new area's OpenStreetMap import before answering with what we already have. */
  coverageBudgetMs = 3500,
): Promise<{ results: RankedLocation[]; widened: boolean; coverage: { imported: number; failed: boolean; pending: boolean } }> {
  // Anywhere outside the seeded data: pull this area's parking from OpenStreetMap.
  // The import can take 20s+, so don't block the search on it: wait a short budget,
  // then let it finish in the background (after()) and tell the client to refresh.
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

  // Query what we already have while the coverage check runs; redo it only if new parking was imported.
  const firstRun = run(filters.radius_m);
  firstRun.catch(() => {});
  const coverageTask = ensureCoverageAround(filters.lat, filters.lng);
  const coverage = await Promise.race([
    coverageTask,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), coverageBudgetMs)),
  ]);
  if (!coverage) after(() => coverageTask.then(() => undefined));
  let rows = coverage?.fetched && coverage.imported > 0 ? await run(filters.radius_m) : await firstRun;
  let widened = false;
  // Nothing close by? Look a bit further rather than showing an empty screen.
  if (rows.length === 0 && filters.radius_m < 8000) {
    rows = await run(Math.min(8000, filters.radius_m * 3));
    widened = rows.length > 0;
  }
  return {
    results: rankLocations(rows, filters, prefs),
    widened,
    coverage: coverage
      ? { imported: coverage.imported, failed: coverage.failed, pending: false }
      : { imported: 0, failed: false, pending: true },
  };
}

/** PostgREST returns numerics as strings; normalise once here. */
function normalizeRow(r: NearbyLocation): NearbyLocation {
  return {
    ...r,
    hourly_price: Number(r.hourly_price),
    rating: r.rating === null ? null : Number(r.rating),
    predicted_rate: Number(r.predicted_rate),
    // A model can't promise certainty: never claim more than 99%.
    free_probability: Math.min(0.99, Number(r.free_probability)),
    distance_m: Number(r.distance_m),
  };
}
