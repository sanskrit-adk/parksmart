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
  const cheapestCount = prices.filter((p) => p === minPrice).length;

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
      explanation: "",
      walk_minutes: walk,
      estimated_total: total,
      predicted_free_spaces: Math.max(0, Math.round(r.total_spots * (1 - Number(r.predicted_rate)))),
    };
  });

  const byScore = [...ranked].sort((a, b) => b.score - a.score);
  if (byScore[0] && byScore[0].free_probability >= 0.4 && byScore[0].is_open !== false) byScore[0].ai_pick = true;

  for (const r of ranked) {
    r.reason = explain(r, {
      isClosest: r.distance_m === minDist,
      isCheapest: Number(r.hourly_price) === minPrice && maxPrice > minPrice,
      cheapestTied: cheapestCount > 1,
      isBestAvailability: Number(r.free_probability) === maxProb,
      maxPrice: filters.max_price_per_hour,
      maxTotal: filters.max_total_price,
      wantsCovered: Boolean(prefs.prefer_covered || filters.covered),
      wantsEv: Boolean(prefs.prefer_ev || filters.ev_charging),
    });
    r.explanation = explainFull(r, {
      isClosest: r.distance_m === minDist,
      isCheapest: Number(r.hourly_price) === minPrice && maxPrice > minPrice,
      isBestAvailability: Number(r.free_probability) === maxProb,
      wantsCovered: Boolean(prefs.prefer_covered || filters.covered),
      wantsEv: Boolean(prefs.prefer_ev || filters.ev_charging),
      wantsAccessible: Boolean(prefs.need_accessible || filters.accessible),
      maxTotal: filters.max_total_price,
      medianPrice: median(prices),
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
    cheapestTied: boolean;
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
  else if (ctx.isCheapest) lead = ctx.cheapestTied ? "One of the cheapest" : "Cheapest";
  else if (ctx.isBestAvailability) lead = "Most likely to have space";
  else lead = `${r.walk_minutes}-min walk`;

  let priceClause = "";
  if (price === 0) priceClause = ", free to park";
  else if (!ctx.isCheapest || lead === "Closest") {
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

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Template explanation in plain English, e.g. "Recommended because it offers an
 * affordable price, is close to your destination and has a high predicted
 * availability." Used directly when no LLM is configured, and as the factual
 * grounding the GenAI explainer rewrites.
 */
function explainFull(
  r: RankedLocation,
  ctx: {
    isClosest: boolean;
    isCheapest: boolean;
    isBestAvailability: boolean;
    wantsCovered: boolean;
    wantsEv: boolean;
    wantsAccessible: boolean;
    maxTotal: number | null;
    medianPrice: number;
  },
) {
  const price = Number(r.hourly_price);
  const prob = Number(r.free_probability);
  const pros: string[] = [];
  const cons: string[] = [];

  if (price === 0) pros.push("it is free to park");
  else if (ctx.isCheapest) pros.push(`it has the lowest price nearby (${money(price)}/hr)`);
  else if (price <= ctx.medianPrice) pros.push(`it offers an affordable price (${money(price)}/hr, at or below the local median)`);
  else cons.push(`it costs more than most nearby options (${money(price)}/hr)`);

  if (ctx.isClosest) pros.push(`it is the closest option to your destination (${r.walk_minutes}-min walk)`);
  else if (r.walk_minutes <= 6) pros.push(`it is close to your destination (${r.walk_minutes}-min walk)`);
  else if (r.walk_minutes > 12) cons.push(`it is a ${r.walk_minutes}-minute walk`);

  if (prob >= 0.7) pros.push(`it has ${ctx.isBestAvailability ? "the highest" : "a high"} predicted availability (${percent(prob)} chance of a free space when you arrive)`);
  else if (prob >= 0.4) cons.push(`its predicted availability is moderate (${percent(prob)})`);
  else cons.push(`it is likely to be full when you arrive (${percent(prob)} predicted availability)`);

  if (ctx.wantsCovered && r.covered) pros.push("it is covered as you asked");
  if (ctx.wantsEv && r.ev_charging) pros.push("it has EV charging");
  if (ctx.wantsAccessible && r.accessible) pros.push("it is wheelchair accessible");
  if (ctx.maxTotal && r.estimated_total <= ctx.maxTotal) pros.push(`the total of ${money(r.estimated_total)} fits your ${money(ctx.maxTotal, { compact: true })} budget`);
  if (ctx.maxTotal && r.estimated_total > ctx.maxTotal) cons.push(`the total of ${money(r.estimated_total)} is over your budget`);
  if (r.is_open === false) cons.push("it is closed at your arrival time");

  const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  const lead = r.ai_pick ? "This parking location is recommended because" : pros.length ? "A good option because" : "Shown as an alternative:";
  let text = pros.length ? `${lead} ${list(pros)}.` : `${lead} it matches your search area.`;
  if (cons.length) text += ` Keep in mind ${list(cons)}.`;
  return text;
}
