import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getOpenAI, structured } from "@/lib/ai/openai";
import { round2 } from "@/lib/pricing";
import type { LocationType, NearbyLocation } from "@/lib/types";

export interface PriceInput {
  location_id?: string;
  lat: number;
  lng: number;
  type: LocationType;
  covered: boolean;
  ev_charging: boolean;
  total_spots: number;
  current_price?: number | null;
}

export interface PriceSuggestion {
  suggested_price: number;
  range_low: number;
  range_high: number;
  peak_price: number;
  off_peak_price: number;
  peak_hours: string;
  confidence: "low" | "medium" | "high";
  reasons: string[];
  comparables: { name: string; price: number; distance_m: number; estimated: boolean }[];
  engine: "ai" | "rules";
}

/** Weekday occupancy prior (mirrors public.prior_occupancy) for demand reasoning. */
const WEEKDAY_PRIOR: Record<LocationType, number[]> = {
  garage: [.15,.12,.10,.10,.10,.12,.20,.35,.60,.78,.85,.88,.88,.87,.85,.80,.70,.55,.50,.50,.45,.35,.25,.18],
  lot: [.10,.08,.07,.07,.07,.10,.18,.30,.50,.65,.72,.75,.78,.75,.72,.68,.60,.50,.45,.42,.38,.30,.20,.14],
  street: [.55,.50,.50,.50,.50,.50,.55,.65,.78,.85,.88,.90,.92,.90,.88,.87,.86,.88,.90,.88,.82,.75,.68,.60],
  private: [.10,.10,.10,.10,.10,.10,.12,.18,.25,.30,.30,.30,.30,.30,.30,.30,.28,.25,.22,.18,.15,.12,.10,.10],
};

export async function suggestPrice(supabase: SupabaseClient, input: PriceInput): Promise<PriceSuggestion> {
  // 1. Comparable prices nearby (real seeded data: SFMTA meters, OSM garages, other hosts).
  const { data: near } = await supabase.rpc("nearby_locations", {
    p_lat: input.lat,
    p_lng: input.lng,
    p_radius_m: 1000,
    p_limit: 40,
  });
  const comps = ((near ?? []) as NearbyLocation[])
    .filter((n) => n.id !== input.location_id && Number(n.hourly_price) > 0)
    .map((n) => ({ name: n.name, price: Number(n.hourly_price), distance_m: Math.round(Number(n.distance_m)), estimated: n.price_estimated, type: n.type, rate: Number(n.predicted_rate) }));
  const prices = comps.map((c) => c.price).sort((a, b) => a - b);
  const q = (p: number) => (prices.length ? prices[Math.min(prices.length - 1, Math.floor(p * (prices.length - 1)))] : null);
  const median = q(0.5);
  const nearbyDemand = comps.length ? comps.reduce((s, c) => s + c.rate, 0) / comps.length : null;

  // 2. This listing's own demand (bookings-derived occupancy history, last 30 days).
  let ownOccupancy: number | null = null;
  let ownBookings = 0;
  if (input.location_id) {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [{ data: hist }, { count }] = await Promise.all([
      supabase.from("occupancy_history").select("occupied_count,total_spots").eq("location_id", input.location_id).gte("ts", since).limit(2000),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("location_id", input.location_id).gte("start_time", since).neq("status", "cancelled"),
    ]);
    if (hist?.length) ownOccupancy = hist.reduce((s, h) => s + h.occupied_count / h.total_spots, 0) / hist.length;
    ownBookings = count ?? 0;
  }

  // 3. Deterministic baseline.
  const prior = WEEKDAY_PRIOR[input.type];
  const peakIdx = prior.map((v, i) => [v, i] as const).filter(([v]) => v >= Math.max(...prior) - 0.05).map(([, i]) => i);
  const peakHours = `${fmtHour(Math.min(...peakIdx))}–${fmtHour(Math.max(...peakIdx) + 1)}`;
  const reasons: string[] = [];
  let base = median ?? (input.type === "garage" ? 6 : input.type === "street" ? 3 : 4.5);
  if (median !== null) reasons.push(`${comps.length} spaces within 1 km charge a median of $${median.toFixed(2)}/hr.`);
  else reasons.push("No priced parking nearby to compare with, so we started from Bay Area averages.");
  if (input.covered) { base *= 1.1; reasons.push("Covered parking commands ~10% more."); }
  if (input.ev_charging) { base *= 1.15; reasons.push("EV charging adds ~15% for drivers who need it."); }
  if (nearbyDemand !== null && nearbyDemand > 0.8) { base *= 1.1; reasons.push(`Nearby parking is ${Math.round(nearbyDemand * 100)}% full right now — demand is high.`); }
  else if (nearbyDemand !== null && nearbyDemand < 0.45) { base *= 0.92; reasons.push(`Nearby parking is only ${Math.round(nearbyDemand * 100)}% full — a sharper price wins bookings.`); }
  if (ownOccupancy !== null && ownOccupancy > 0.75) { base *= 1.1; reasons.push(`Your space was ${Math.round(ownOccupancy * 100)}% booked over 30 days — you can charge more.`); }
  else if (ownOccupancy !== null && ownOccupancy < 0.25) { base *= 0.9; reasons.push(`Your space was only ${Math.round(ownOccupancy * 100)}% booked — a lower price should fill it.`); }

  const baseline: PriceSuggestion = {
    suggested_price: nice(base),
    range_low: nice(base * 0.85),
    range_high: nice(base * 1.2),
    peak_price: nice(base * 1.25),
    off_peak_price: nice(base * 0.7),
    peak_hours: `Weekdays ${peakHours}`,
    confidence: comps.length >= 8 ? (ownBookings >= 10 ? "high" : "medium") : "low",
    reasons,
    comparables: comps.slice(0, 6).map(({ name, price, distance_m, estimated }) => ({ name, price, distance_m, estimated })),
    engine: "rules",
  };

  if (!getOpenAI()) return baseline;

  // 4. LLM refinement: reason over the same evidence, stay near the baseline.
  try {
    const ai = await structured<Omit<PriceSuggestion, "comparables" | "engine">>({
      name: "price_suggestion",
      system:
        "You are a parking revenue manager for the San Francisco Bay Area. Recommend an hourly price for a host's parking listing. " +
        "Ground every reason in the evidence given; never invent numbers. Keep the suggestion within ±25% of the baseline unless evidence strongly supports otherwise. " +
        "Prices end in .00, .25, .50 or .75. Reasons are short sentences a host understands (max 4).",
      user: JSON.stringify({
        listing: { type: input.type, covered: input.covered, ev_charging: input.ev_charging, spaces: input.total_spots, current_price: input.current_price ?? null },
        comparables: comps.slice(0, 15),
        nearby_current_occupancy: nearbyDemand,
        own_occupancy_30d: ownOccupancy,
        own_bookings_30d: ownBookings,
        typical_weekday_occupancy_by_hour: prior,
        baseline,
      }),
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["suggested_price", "range_low", "range_high", "peak_price", "off_peak_price", "peak_hours", "confidence", "reasons"],
        properties: {
          suggested_price: { type: "number" },
          range_low: { type: "number" },
          range_high: { type: "number" },
          peak_price: { type: "number" },
          off_peak_price: { type: "number" },
          peak_hours: { type: "string" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          reasons: { type: "array", items: { type: "string" } },
        },
      },
    });
    const clampToBaseline = (v: number) => nice(Math.min(baseline.suggested_price * 1.5, Math.max(baseline.suggested_price * 0.6, v)));
    return {
      ...ai,
      suggested_price: clampToBaseline(ai.suggested_price),
      range_low: clampToBaseline(ai.range_low),
      range_high: clampToBaseline(ai.range_high),
      peak_price: clampToBaseline(ai.peak_price),
      off_peak_price: clampToBaseline(ai.off_peak_price),
      reasons: ai.reasons.slice(0, 4),
      comparables: baseline.comparables,
      engine: "ai",
    };
  } catch (err) {
    console.error("AI pricing failed, using baseline", err);
    return baseline;
  }
}

function nice(v: number) {
  return Math.max(0.5, round2(Math.round(v * 4) / 4));
}

function fmtHour(h: number) {
  const hh = h % 24;
  return `${hh % 12 === 0 ? 12 : hh % 12}${hh < 12 ? "am" : "pm"}`;
}
