import "server-only";

import { getOpenAI, structured } from "@/lib/ai/openai";
import type { LocationType, SearchFilters } from "@/lib/types";

type ParsedQuery = Omit<SearchFilters, "lat" | "lng"> & { place_full_name: string | null; summary: string };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "place", "place_full_name", "radius_m", "duration_hours", "arrive_at", "max_price_per_hour",
    "max_total_price", "covered", "ev_charging", "accessible", "open_now", "types", "sort", "summary",
  ],
  properties: {
    place: { type: ["string", "null"], description: "Destination as the user wrote it, or null if none (search near the user)." },
    place_full_name: {
      type: ["string", "null"],
      description: "Fully qualified, geocodable name of the destination including city, e.g. 'San Francisco Bay University, Fremont, CA'. Expand abbreviations you are confident about (SFBU, SFO, UCSF, AT&T Park → Oracle Park).",
    },
    radius_m: { type: "integer", description: "Search radius in meters. 'near'/'close' ≈ 800, default 2000, 'walking distance' ≈ 600." },
    duration_hours: { type: "number", description: "Parking duration in hours, default 2." },
    arrive_at: { type: ["string", "null"], description: "ISO 8601 arrival time with offset if the user specified one, otherwise null (now)." },
    max_price_per_hour: { type: ["number", "null"], description: "Hourly price ceiling. 'cheap' without a number ≈ 5." },
    max_total_price: { type: ["number", "null"], description: "Total budget for the whole stay, e.g. 'under $15' for 2 hours → 15." },
    covered: { type: ["boolean", "null"] },
    ev_charging: { type: ["boolean", "null"] },
    accessible: { type: ["boolean", "null"], description: "Wheelchair / disabled accessible." },
    open_now: { type: "boolean" },
    types: {
      type: ["array", "null"],
      items: { type: "string", enum: ["garage", "lot", "street", "private"] },
      description: "Restrict to these kinds of parking only when the user asked (garage, lot, street meters, private driveway).",
    },
    sort: { type: "string", enum: ["best", "price", "distance", "availability"] },
    summary: { type: "string", description: "Short human summary of the understood request, max 12 words." },
  },
} as const;

export interface ParseResult {
  filters: ParsedQuery;
  engine: "ai" | "rules";
}

export async function parseSearchQuery(query: string, now = new Date()): Promise<ParseResult> {
  if (getOpenAI()) {
    try {
      const filters = await structured<ParsedQuery>({
        name: "parking_search",
        schema: SCHEMA,
        system:
          "You convert natural-language parking requests in the San Francisco Bay Area into search filters. " +
          `The current time is ${now.toISOString()} (user timezone America/Los_Angeles). ` +
          "Only set a filter when the user expressed it. If the user gives a total budget and a duration, set max_total_price, not max_price_per_hour.",
        user: query.slice(0, 500),
        maxTokens: 400,
      });
      return { filters: sanitize(filters), engine: "ai" };
    } catch (err) {
      console.error("AI search parse failed, using rules", err);
    }
  }
  return { filters: ruleParse(query), engine: "rules" };
}

function sanitize(f: ParsedQuery): ParsedQuery {
  return {
    ...f,
    radius_m: clamp(f.radius_m || 2000, 200, 15000),
    duration_hours: clamp(f.duration_hours || 2, 0.5, 24),
    max_price_per_hour: f.max_price_per_hour && f.max_price_per_hour > 0 ? f.max_price_per_hour : null,
    max_total_price: f.max_total_price && f.max_total_price > 0 ? f.max_total_price : null,
    arrive_at: f.arrive_at && !Number.isNaN(Date.parse(f.arrive_at)) ? f.arrive_at : null,
    types: f.types?.length ? f.types : null,
  };
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Deterministic fallback used when no LLM is configured or the call fails. */
export function ruleParse(query: string): ParsedQuery {
  const q = query.toLowerCase();
  const durationMatch = q.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/) ?? q.match(/(\d+)\s*(?:min|mins|minutes)\b/);
  let duration = 2;
  if (durationMatch) {
    duration = Number(durationMatch[1]);
    if (/min/.test(durationMatch[0])) duration = duration / 60;
  }
  const money = q.match(/(?:under|below|less than|max|<|up to)\s*\$?\s*(\d+(?:\.\d+)?)(\s*(?:\/|per)\s*(?:h|hr|hour))?/);
  let maxHourly: number | null = null;
  let maxTotal: number | null = null;
  if (money) {
    if (money[2]) maxHourly = Number(money[1]);
    else maxTotal = Number(money[1]);
  } else if (/\bcheap|affordable|budget\b/.test(q)) {
    maxHourly = 5;
  }
  const near = query.match(/(?:near|by|close to|around|at)\s+([^,.;]+?)(?=\s+(?:for|under|below|with|tonight|today|tomorrow)\b|[,.;]|$)/i);
  const types: LocationType[] = [];
  if (/\bgarage/.test(q)) types.push("garage");
  if (/\bstreet|meter/.test(q)) types.push("street");
  if (/\blot\b/.test(q)) types.push("lot");
  if (/driveway|private/.test(q)) types.push("private");

  const place = near?.[1]?.trim() || null;
  return {
    place,
    place_full_name: place,
    radius_m: /walking distance|very close|right next/.test(q) ? 600 : /\bnear|close\b/.test(q) ? 1200 : 2000,
    duration_hours: clamp(duration, 0.5, 24),
    arrive_at: null,
    max_price_per_hour: maxHourly,
    max_total_price: maxTotal,
    covered: /covered|indoor|garage/.test(q) ? true : null,
    ev_charging: /\bev\b|charg|electric|tesla/.test(q) ? true : null,
    accessible: /accessib|wheelchair|disab|ada\b/.test(q) ? true : null,
    open_now: /open now|right now/.test(q),
    types: types.length ? types : null,
    sort: /cheapest/.test(q) ? "price" : /closest|nearest/.test(q) ? "distance" : "best",
    summary: place ? `Parking near ${place}` : "Parking near you",
  };
}
