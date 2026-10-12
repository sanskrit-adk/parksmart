import { money, percent, walkMinutes } from "@/lib/format";
import { priceBreakdown } from "@/lib/pricing";
import type { NearbyLocation, RankedLocation, SearchFilters, UserPreferences } from "@/lib/types";

/**
 * Smart recommendations: a transparent weighted score over
 *   predicted availability · walking distance to the destination · price ·
 *   rating · personal preferences
 * The top result gets the "AI Pick" badge and every result gets a one-line
 * explanation built from the factors that actually drove its score.
 */
export function rankLocations(
  rows: NearbyLocation[],
  filters: Pick<SearchFilters, "duration_hours" | "max_price_per_hour" | "max_total_price" | "covered" | "ev_charging" | "accessible" | "sort">,
  prefs: UserPreferences = {},
): RankedLocation[] {
  if (rows.length === 0) return [];
  const hours = Math.max(0.5, filters.duration_hours || 2);
  const start = new Date();
  const end = new Date(start.getTime() + hours * 3_600_000);

  const prices = rows.map((r) => Number(r.hourly_price));
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const minDist = Math.min(...rows.map((r) => r.distance_m));
  const maxProb = Math.max(...rows.map((r) => Number(r.free_probability)));

  const priceWeight = prefs.price_sensitivity === "high" ? 0.35 : prefs.price_sensitivity === "low" ? 0.15 : 0.25;
  const maxWalk = prefs.max_walk_minutes ?? 12;

  const ranked = rows.map((r): RankedLocation => {
    const price = Number(r.hourly_price);
    const prob = Number(r.free_probability);
    const walk = walkMinutes(r.distance_m);
    const total = priceBreakdown(price, start, end).total;

    const priceScore = maxPrice === minPrice ? 1 : 1 - (price - minPrice) / (maxPrice - minPrice);
    const walkScore = Math.exp(-walk / Math.max(4, maxWalk * 0.7));
    const ratingScore = r.rating ? (Number(r.rating) / 5) * Math.min(1, r.review_count / 5) + 0.75 * (1 - Math.min(1, r.review_count / 5)) : 0.75;

    let prefScore = 0.5;
    if (prefs.prefer_covered || filters.covered) prefScore += r.covered ? 0.25 : -0.15;
    if (prefs.prefer_ev || filters.ev_charging) prefScore += r.ev_charging ? 0.25 : -0.15;
    if (prefs.need_accessible || filters.accessible) prefScore += r.accessible ? 0.3 : -0.4;

    let score = 0.35 * prob + 0.25 * walkScore + priceWeight * priceScore + 0.1 * ratingScore + 0.05 * Math.max(0, Math.min(1, prefScore));
    if (filters.max_total_price && total > filters.max_total_price) score -= 0.4;
    if (walk > maxWalk) score -= 0.1 * Math.min(3, (walk - maxWalk) / 5);
    if (r.is_open === false) score -= 0.5;

    return {
      ...r,
      score: Math.round(score * 1000) / 1000,
      ai_pick: false,
      reason: "",
      walk_minutes: walk,
      estimated_total: total,
    };
  });

  const byScore = [...ranked].sort((a, b) => b.score - a.score);
  if (byScore[0] && byScore[0].free_probability >= 0.4 && byScore[0].is_open !== false) byScore[0].ai_pick = true;

  for (const r of ranked) {
    r.reason = explain(r, {
      isClosest: r.distance_m === minDist,
      isCheapest: Number(r.hourly_price) === minPrice && maxPrice > minPrice,
      isBestAvailability: Number(r.free_probability) === maxProb,
      maxPrice: filters.max_price_per_hour,
      maxTotal: filters.max_total_price,
      wantsCovered: Boolean(prefs.prefer_covered || filters.covered),
      wantsEv: Boolean(prefs.prefer_ev || filters.ev_charging),
    });
  }

  const sort = filters.sort ?? "best";
  const sorted =
    sort === "price" ? [...ranked].sort((a, b) => a.hourly_price - b.hourly_price || b.score - a.score) :
    sort === "distance" ? [...ranked].sort((a, b) => a.distance_m - b.distance_m) :
    sort === "availability" ? [...ranked].sort((a, b) => b.free_probability - a.free_probability || b.score - a.score) :
    byScore;
  return sorted;
}

function explain(
  r: RankedLocation,
  ctx: {
    isClosest: boolean;
    isCheapest: boolean;
    isBestAvailability: boolean;
    maxPrice: number | null;
    maxTotal: number | null;
    wantsCovered: boolean;
    wantsEv: boolean;
  },
) {
  const prob = percent(r.free_probability);
  const price = Number(r.hourly_price);
  let lead: string;
  if (ctx.isClosest) lead = "Closest";
  else if (ctx.isCheapest) lead = "Cheapest";
  else if (ctx.isBestAvailability) lead = "Most likely to have space";
  else lead = `${r.walk_minutes}-min walk`;

  let priceClause = "";
  if (price === 0) priceClause = ", free to park";
  else if (lead !== "Cheapest") {
    if (ctx.maxTotal && r.estimated_total <= ctx.maxTotal) priceClause = ` at ${money(r.estimated_total)} total`;
    else if (ctx.maxPrice && price <= ctx.maxPrice) priceClause = ` under ${money(Math.ceil(ctx.maxPrice), { compact: true })}/hr`;
    else priceClause = ` at ${money(price)}/hr`;
  }

  const availClause = lead === "Most likely to have space" ? ` (${prob})` : ` with ${prob} chance of being free`;
  const extras: string[] = [];
  if (ctx.wantsCovered && r.covered) extras.push("covered");
  if (ctx.wantsEv && r.ev_charging) extras.push("EV charging");
  if (r.is_open === false) extras.push("closed at that time");

  return `${lead}${priceClause}${availClause}${extras.length ? ` · ${extras.join(", ")}` : ""}`;
}
