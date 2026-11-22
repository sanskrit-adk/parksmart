import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocationType, NearbyLocation } from "@/lib/types";

/**
 * Parking demand forecasting (traditional ML, no LLM).
 *
 * Runs the same availability model used everywhere else in ParkSmart
 * (`predict_occupancy_rate()` in Postgres: time-of-day/weekday prior per
 * parking type, blended with up to 8 weeks of observed occupancy for the same
 * weekday and hour, plus ParkSmart bookings, nearby events and fresh camera
 * counts) over the largest places in an area, then aggregates the forecasts
 * into area-level demand, peak hours and busiest locations.
 *
 * Everything returned here is a PREDICTION. Live counts stay on the
 * Live/Estimated availability badges.
 */

export interface DemandHour {
  ts: string;
  /** Capacity-weighted predicted occupancy across the sampled places, 0..1. */
  occupancy_rate: number;
  /** Predicted free spaces across the sampled places. */
  expected_free: number;
}

export interface DemandLocation {
  id: string;
  name: string;
  type: LocationType;
  total_spots: number;
  hourly_price: number;
  price_estimated: boolean;
  now_rate: number;
  peak_rate: number;
  peak_ts: string;
  quiet_ts: string;
  /** Spaces expected to be free at the next peak. */
  free_at_peak: number;
}

export interface DemandReport {
  generated_at: string;
  center: { lat: number; lng: number };
  hourly: DemandHour[];
  peak_hours: DemandHour[];
  quietest: DemandHour | null;
  busiest: DemandLocation[];
  sampled_locations: number;
  sampled_capacity: number;
  history: { observations: number; sample_observations: number };
  /** True when the history feeding the model is synthetic seed data (or there is none). */
  demo_data: boolean;
}

interface ForecastRow {
  ts: string;
  occupancy_rate: number | string;
}

export async function demandForecast(
  supabase: SupabaseClient,
  center: { lat: number; lng: number },
  opts: { radiusM?: number; sample?: number } = {},
): Promise<DemandReport> {
  const radius = opts.radiusM ?? 2500;
  const sampleSize = opts.sample ?? 10;

  const { data, error } = await supabase.rpc("nearby_locations", {
    p_lat: center.lat,
    p_lng: center.lng,
    p_radius_m: radius,
    p_arrive_at: new Date().toISOString(),
    p_limit: 60,
  });
  if (error) throw error;

  // Model the places that carry the most capacity in the area.
  const rows = ((data ?? []) as NearbyLocation[])
    .filter((r) => r.total_spots > 0)
    .sort((a, b) => b.total_spots - a.total_spots)
    .slice(0, sampleSize);

  const forecasts = await Promise.all(
    rows.map(async (r) => {
      const { data: f } = await supabase.rpc("location_forecast", { p_location_id: r.id, p_from: new Date().toISOString(), p_hours: 24 });
      return { loc: r, points: ((f ?? []) as ForecastRow[]).map((p) => ({ ts: p.ts, rate: Number(p.occupancy_rate) })) };
    }),
  );
  const usable = forecasts.filter((f) => f.points.length > 0);
  const capacity = usable.reduce((s, f) => s + f.loc.total_spots, 0);

  const hourly: DemandHour[] = (usable[0]?.points ?? []).map((p, i) => {
    let occupied = 0;
    for (const f of usable) occupied += (f.points[i]?.rate ?? 0) * f.loc.total_spots;
    return {
      ts: p.ts,
      occupancy_rate: capacity ? round(occupied / capacity) : 0,
      expected_free: Math.max(0, Math.round(capacity - occupied)),
    };
  });

  const byRate = [...hourly].sort((a, b) => b.occupancy_rate - a.occupancy_rate);
  const busiest: DemandLocation[] = usable
    .map(({ loc, points }) => {
      const peak = points.reduce((a, b) => (b.rate > a.rate ? b : a), points[0]);
      const quiet = points.reduce((a, b) => (b.rate < a.rate ? b : a), points[0]);
      return {
        id: loc.id,
        name: loc.name,
        type: loc.type,
        total_spots: loc.total_spots,
        hourly_price: Number(loc.hourly_price),
        price_estimated: loc.price_estimated,
        now_rate: round(points[0].rate),
        peak_rate: round(peak.rate),
        peak_ts: peak.ts,
        quiet_ts: quiet.ts,
        free_at_peak: Math.max(0, Math.round(loc.total_spots * (1 - peak.rate))),
      };
    })
    .sort((a, b) => b.peak_rate - a.peak_rate)
    .slice(0, 6);

  // What the model learned from: observed occupancy for these places, 8 weeks.
  const ids = usable.map((f) => f.loc.id);
  const since = new Date(Date.now() - 56 * 86_400_000).toISOString();
  const [all, sample] = ids.length
    ? await Promise.all([
        supabase.from("occupancy_history").select("id", { count: "exact", head: true }).in("location_id", ids).gte("ts", since),
        supabase.from("occupancy_history").select("id", { count: "exact", head: true }).in("location_id", ids).gte("ts", since).eq("source", "sample"),
      ])
    : [{ count: 0 }, { count: 0 }];
  const observations = all.count ?? 0;
  const sampleObs = sample.count ?? 0;

  return {
    generated_at: new Date().toISOString(),
    center,
    hourly,
    peak_hours: byRate.slice(0, 3).sort((a, b) => a.ts.localeCompare(b.ts)),
    quietest: byRate[byRate.length - 1] ?? null,
    busiest,
    sampled_locations: usable.length,
    sampled_capacity: capacity,
    history: { observations, sample_observations: sampleObs },
    demo_data: observations === 0 || sampleObs / observations > 0.5,
  };
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
