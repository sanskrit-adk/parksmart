/**
 * Demo data generators for the Planner, Event alerts and Impact features.
 *
 * Everything here is SYNTHETIC and generated locally from fixed formulas plus a
 * seeded random generator: no database, no network, no API keys. The same
 * inputs always produce the same numbers. UI built on it must say "Demo data".
 */

export const DEMO_LABEL = "Demo data";

// ----------------------------------------------------------------- utilities
/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const bump = (h: number, center: number, width: number) => Math.exp(-((h - center) ** 2) / (2 * width * width));

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const fmtHour = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 || h === 24 ? "AM" : "PM"}`;

// ------------------------------------------------------------ neighbourhoods
export type Profile = "office" | "retail" | "nightlife" | "campus" | "residential" | "waterfront";

export interface Neighborhood {
  id: string;
  name: string;
  lat: number;
  lng: number;
  profile: Profile;
  basePrice: number;
  spaces: number;
}

export const NEIGHBORHOODS: Neighborhood[] = [
  { id: "soma", name: "SoMa", lat: 37.7785, lng: -122.4056, profile: "office", basePrice: 5.5, spaces: 4200 },
  { id: "fidi", name: "Financial District", lat: 37.7946, lng: -122.3999, profile: "office", basePrice: 7, spaces: 5100 },
  { id: "union-square", name: "Union Square", lat: 37.788, lng: -122.4075, profile: "retail", basePrice: 6.5, spaces: 3800 },
  { id: "mission-bay", name: "Mission Bay", lat: 37.7706, lng: -122.3915, profile: "campus", basePrice: 4.5, spaces: 2600 },
  { id: "mission", name: "Mission District", lat: 37.7599, lng: -122.4148, profile: "nightlife", basePrice: 3.5, spaces: 2900 },
  { id: "marina", name: "Marina", lat: 37.8037, lng: -122.4368, profile: "residential", basePrice: 3.25, spaces: 2100 },
  { id: "embarcadero", name: "Embarcadero & Wharf", lat: 37.8008, lng: -122.4098, profile: "waterfront", basePrice: 5, spaces: 3300 },
  { id: "hayes-valley", name: "Hayes Valley & Civic Center", lat: 37.7766, lng: -122.4241, profile: "retail", basePrice: 4, spaces: 2400 },
];

export const neighborhood = (id: string) => NEIGHBORHOODS.find((n) => n.id === id) ?? NEIGHBORHOODS[0];

/** Nearest neighbourhood to a point (equirectangular distance is fine at city scale). */
export function nearestNeighborhood(lat: number, lng: number) {
  let best = NEIGHBORHOODS[0];
  let bestD = Infinity;
  for (const n of NEIGHBORHOODS) {
    const d = (n.lat - lat) ** 2 + ((n.lng - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bestD) [best, bestD] = [n, d];
  }
  return best;
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = (b.lat - a.lat) * 111;
  const dLng = (b.lng - a.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat ** 2 + dLng ** 2);
}

/** Typical occupancy (0–1) for a neighbourhood at a weekday (0 = Mon) and hour. */
export function demandAt(n: Neighborhood, day: number, hour: number) {
  const weekend = day >= 5;
  let d: number;
  switch (n.profile) {
    case "office":
      d = weekend ? 0.25 + 0.2 * bump(hour, 14, 3) : 0.15 + 0.75 * bump(hour, 12, 3.2);
      break;
    case "retail":
      d = 0.15 + (weekend ? 0.75 : 0.6) * bump(hour, weekend ? 14 : 13, 3.5) + 0.1 * bump(hour, 18, 1.5);
      break;
    case "nightlife":
      d = 0.25 + 0.3 * bump(hour, 13, 3) + (day >= 4 ? 0.6 : 0.4) * bump(hour, 21, 2.2);
      break;
    case "campus":
      d = weekend ? 0.2 + 0.25 * bump(hour, 13, 3) : 0.15 + 0.7 * bump(hour, 11, 2.6) + 0.25 * bump(hour, 18.5, 1.5);
      break;
    case "residential":
      d = 0.55 + 0.25 * bump(hour, 20, 3) - (weekend ? 0 : 0.2 * bump(hour, 11, 3));
      break;
    case "waterfront":
      d = 0.2 + (weekend ? 0.7 : 0.5) * bump(hour, 14, 3.5);
      break;
  }
  const noise = rng(hash(`${n.id}:${day}:${hour}`))() * 0.08 - 0.04;
  return clamp(d + noise, 0.05, 0.98);
}

/** Typical hourly price: base price adjusted by demand (demand-responsive, SFMTA-style). */
export function priceAt(n: Neighborhood, day: number, hour: number, extraDemand = 0) {
  const d = clamp(demandAt(n, day, hour) + extraDemand, 0, 0.99);
  return Math.round(n.basePrice * (0.7 + 0.8 * d) * 4) / 4;
}

/** Chance at least one space is free in the blocks you'd consider (rough, for demos). */
export const freeChance = (demand: number) => clamp(1 - demand ** 3 * 0.95, 0.03, 0.99);

/** Grid of demand by day × hour (6 AM – 11 PM shown). */
export function weekGrid(n: Neighborhood, hours = range(6, 24)) {
  return DAYS.map((label, day) => ({ label, day, cells: hours.map((hour) => ({ hour, demand: demandAt(n, day, hour) })) }));
}

export function range(from: number, to: number) {
  return Array.from({ length: to - from }, (_, i) => from + i);
}

export interface ArrivalOption {
  hour: number;
  demand: number;
  price: number;
  chance: number;
  searchMinutes: number;
}

export const searchMinutes = (demand: number) => Math.round(2 + 14 * demand ** 2);

export function arrivalOption(n: Neighborhood, day: number, hour: number, extraDemand = 0): ArrivalOption {
  const demand = clamp(demandAt(n, day, hour) + extraDemand, 0, 0.99);
  return { hour, demand, price: priceAt(n, day, hour, extraDemand), chance: freeChance(demand), searchMinutes: searchMinutes(demand) };
}

/** Best arrival within ±3 hours of the requested time (scores availability, then price). */
export function bestArrival(n: Neighborhood, day: number, hour: number, extraDemand: (h: number) => number = () => 0) {
  const options = range(Math.max(5, hour - 3), Math.min(23, hour + 4)).map((h) => arrivalOption(n, day, h, extraDemand(h)));
  const score = (o: ArrivalOption) => o.chance * 1 - (o.price / n.basePrice) * 0.25 - Math.abs(o.hour - hour) * 0.03;
  const best = [...options].sort((a, b) => score(b) - score(a))[0];
  const requested = options.find((o) => o.hour === hour) ?? arrivalOption(n, day, hour, extraDemand(hour));
  return { best, requested, options };
}

// -------------------------------------------------------------------- events
export interface DemoEvent {
  id: string;
  name: string;
  venue: string;
  neighborhoodId: string;
  starts: Date;
  ends: Date;
  /** Extra occupancy added in the affected area at peak (0–1). */
  impact: number;
  attendees: number;
  category: "sports" | "concert" | "festival" | "campus" | "conference";
  alternativeId: string;
}

const EVENT_TEMPLATES: Omit<DemoEvent, "id" | "starts" | "ends">[] = [
  { name: "Giants vs. Dodgers", venue: "Oracle Park", neighborhoodId: "mission-bay", impact: 0.35, attendees: 38000, category: "sports", alternativeId: "soma" },
  { name: "Warriors home game", venue: "Chase Center", neighborhoodId: "mission-bay", impact: 0.3, attendees: 18000, category: "sports", alternativeId: "mission" },
  { name: "Holiday Market & Tree Lighting", venue: "Union Square", neighborhoodId: "union-square", impact: 0.25, attendees: 12000, category: "festival", alternativeId: "hayes-valley" },
  { name: "University Commencement", venue: "Mission Bay campus", neighborhoodId: "mission-bay", impact: 0.2, attendees: 3500, category: "campus", alternativeId: "soma" },
  { name: "Tech Summit 2026", venue: "Moscone Center", neighborhoodId: "soma", impact: 0.28, attendees: 22000, category: "conference", alternativeId: "hayes-valley" },
  { name: "Symphony Night", venue: "Davies Symphony Hall", neighborhoodId: "hayes-valley", impact: 0.18, attendees: 2700, category: "concert", alternativeId: "mission" },
  { name: "Waterfront Food Festival", venue: "Ferry Building", neighborhoodId: "embarcadero", impact: 0.22, attendees: 9000, category: "festival", alternativeId: "fidi" },
];

// [days from today, start hour, duration hours]
const EVENT_SLOTS: [number, number, number][] = [[0, 18, 4], [1, 19, 3], [2, 16, 5], [3, 10, 3], [4, 9, 8], [5, 19, 3], [6, 11, 6]];

/** Upcoming demo events, generated relative to `now` so there is always something ahead. */
export function demoEvents(now = new Date()): DemoEvent[] {
  const base = new Date(now);
  base.setMinutes(0, 0, 0);
  return EVENT_TEMPLATES.map((t, i) => {
    const [dayOffset, hour, dur] = EVENT_SLOTS[i];
    const starts = new Date(base);
    starts.setDate(starts.getDate() + dayOffset);
    starts.setHours(hour);
    const ends = new Date(starts.getTime() + dur * 3_600_000);
    return { ...t, id: `demo-event-${i}`, starts, ends };
  })
    .filter((e) => e.ends > now)
    .sort((a, b) => a.starts.getTime() - b.starts.getTime());
}

/** Extra demand an event adds at a given time (ramps up 2 h before, eases off 1 h after). */
export function eventBoost(e: DemoEvent, at: Date) {
  const t = at.getTime();
  const s = e.starts.getTime() - 2 * 3_600_000;
  const end = e.ends.getTime() + 3_600_000;
  if (t < s || t > end) return 0;
  if (t < e.starts.getTime()) return e.impact * ((t - s) / (2 * 3_600_000));
  if (t > e.ends.getTime()) return e.impact * (1 - (t - e.ends.getTime()) / 3_600_000);
  return e.impact;
}

/** Monday-based weekday index for a Date. */
export const weekday = (d: Date) => (d.getDay() + 6) % 7;

export function eventForecast(e: DemoEvent) {
  const n = neighborhood(e.neighborhoodId);
  const alt = neighborhood(e.alternativeId);
  const day = weekday(e.starts);
  const peakHour = e.starts.getHours();
  const normal = demandAt(n, day, peakHour);
  const withEvent = clamp(normal + e.impact * (1 - normal) * 1.6, 0, 0.98);
  const normalPrice = priceAt(n, day, peakHour);
  const suggestedPrice = Math.round(normalPrice * (1 + Math.min(0.5, e.impact)) * 4) / 4;
  return {
    neighborhood: n,
    alternative: alt,
    normal,
    withEvent,
    altDemand: demandAt(alt, day, peakHour),
    walkMinutes: Math.round((distanceKm(n, alt) / 4.8) * 60),
    window: `${fmtHour(Math.max(0, peakHour - 2))}–${fmtHour(Math.min(24, e.ends.getHours() + 1))}`,
    normalPrice,
    suggestedPrice,
    priceIncreasePct: Math.round((suggestedPrice / normalPrice - 1) * 100),
  };
}

// -------------------------------------------------------------------- impact
/**
 * Assumptions for the impact estimate. Cruising-for-parking figures are in the
 * range commonly cited for dense US cities (e.g. INRIX 2017 parking-pain study;
 * SFpark evaluation). EPA: ~404 g CO₂ per mile for a typical passenger car.
 */
export const IMPACT_ASSUMPTIONS = {
  searchMinutesWithout: 9,
  searchMinutesWith: 2,
  cruisingMph: 10,
  co2GramsPerMile: 404,
  mpg: 25,
  fuelPricePerGallon: 5.1,
};

export function impactFromTrips(trips: number) {
  const a = IMPACT_ASSUMPTIONS;
  const minutes = trips * (a.searchMinutesWithout - a.searchMinutesWith);
  const miles = (minutes / 60) * a.cruisingMph;
  return {
    trips,
    minutes,
    hours: minutes / 60,
    miles,
    co2Kg: (miles * a.co2GramsPerMile) / 1000,
    fuelGallons: miles / a.mpg,
    fuelCost: (miles / a.mpg) * a.fuelPricePerGallon,
  };
}

/** 30 days of demo booking counts (city-wide and per neighbourhood). */
export function demoTrips(days = 30, now = new Date()) {
  const r = rng(20261122);
  const series = range(0, days).map((i) => {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - (days - 1 - i));
    const wd = weekday(d);
    const growth = 1 + i / days * 0.35;
    const trips = Math.round((wd >= 5 ? 210 : 320) * growth * (0.85 + r() * 0.3));
    return { date: d, trips };
  });
  const total = series.reduce((s, d) => s + d.trips, 0);
  const shares = NEIGHBORHOODS.map((n) => ({ n, w: n.spaces * (0.6 + r() * 0.8) }));
  const sumW = shares.reduce((s, x) => s + x.w, 0);
  const byNeighborhood = shares
    .map(({ n, w }) => ({ neighborhood: n, trips: Math.round((total * w) / sumW) }))
    .sort((a, b) => b.trips - a.trips);
  return { series, total, byNeighborhood };
}
