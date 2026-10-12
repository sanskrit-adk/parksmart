/**
 * ParkSmart seed: imports REAL parking data into Supabase.
 *
 *   - Garages & lots: OpenStreetMap via the Overpass API (amenity=parking)
 *   - Street meters:  SFMTA "Parking Meters" on DataSF, grouped by block face
 *   - Test accounts:  driver / host / admin (+ two clearly-labelled demo host listings)
 *
 * Usage:
 *   npm run seed                      # Bay Area, everything
 *   npm run seed -- --region sf       # San Francisco only (faster)
 *   npm run seed -- --dry-run         # fetch + transform, write JSON, don't touch the DB
 *   npm run seed -- --refresh         # ignore the local download cache
 *   npm run seed -- --sample-data     # ALSO add synthetic occupancy history + sample events (flagged)
 *   npm run seed -- --skip-osm --skip-meters --skip-users
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseOsmOpeningHours } from "../src/lib/opening-hours";

config({ path: ".env.local" });
config();

const args = new Set(process.argv.slice(2));
const regionArg = process.argv.find((a, i) => process.argv[i - 1] === "--region") ?? "bayarea";
const DRY = args.has("--dry-run");
const REFRESH = args.has("--refresh");
const SAMPLE = args.has("--sample-data");
const CACHE_DIR = join(process.cwd(), "supabase", "seed-data");
mkdirSync(CACHE_DIR, { recursive: true });

const REGIONS = {
  sf: { s: 37.70, w: -122.52, n: 37.84, e: -122.35, rows: 1, cols: 2 },
  bayarea: { s: 37.20, w: -122.55, n: 38.05, e: -121.75, rows: 4, cols: 4 },
} as const;
const region = REGIONS[regionArg as keyof typeof REGIONS] ?? REGIONS.bayarea;

const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const UA = "ParkSmart-seed/1.0 (+https://github.com/; open-data import)";

type LocType = "garage" | "lot" | "street" | "private";
interface Row {
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
  description: string | null;
  osm_tags: Record<string, string> | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log("•", ...a);

// ---------------------------------------------------------------------------
// OpenStreetMap
// ---------------------------------------------------------------------------
interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function overpass(query: string, attempts = 4): Promise<OsmElement[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const url = OVERPASS[attempt % OVERPASS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(180_000),
      });
      const text = await res.text();
      if (!res.ok || !text.trimStart().startsWith("{")) throw new Error(`${url} → ${res.status}: ${text.slice(0, 120).replace(/\s+/g, " ")}`);
      return (JSON.parse(text) as { elements: OsmElement[] }).elements;
    } catch (err) {
      lastErr = err;
      const wait = 5000 * (attempt + 1);
      console.warn(`  Overpass attempt ${attempt + 1} failed (${(err as Error).message}); retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

const DOWNTOWN_SF = { lat: 37.788, lng: -122.4075 };
function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const inSF = (lat: number, lng: number) => lat > 37.70 && lat < 37.835 && lng > -122.52 && lng < -122.355;

function parseCharge(charge?: string): number | null {
  if (!charge) return null;
  const m = charge.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:USD)?\s*\/\s*(?:h|hr|hour)\b/i) ?? charge.match(/(\d+(?:\.\d+)?)\s*USD\s*\/\s*hour/i);
  return m ? Number(m[1]) : null;
}

function osmToRow(el: OsmElement): Row | null {
  const t = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat == null || lng == null) return null;
  const parking = t.parking ?? "";
  const capacity = Number.parseInt(t.capacity ?? "", 10);
  // Keep places drivers can actually use and identify.
  const notable = Boolean(t.name) || capacity >= 10 || ["multi-storey", "underground", "rooftop"].includes(parking);
  if (!notable) return null;
  if (["private", "no", "customers", "delivery", "employees", "permit", "residents"].includes(t.access ?? "")) return null;

  const type: LocType = ["multi-storey", "underground", "rooftop"].includes(parking)
    ? "garage"
    : ["street_side", "lane", "on_kerb", "half_on_kerb"].includes(parking)
      ? "street"
      : "lot";
  const covered = ["multi-storey", "underground"].includes(parking) || t.covered === "yes";
  const ev = Number.parseInt(t["capacity:charging"] ?? "0", 10) > 0 || t["capacity:charging"] === "yes";
  const accessible = t.wheelchair === "yes" || Number.parseInt(t["capacity:disabled"] ?? "0", 10) > 0 || t["capacity:disabled"] === "yes";

  const capEstimate = type === "garage" ? 250 : type === "street" ? 12 : 40;
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
  const name = t.name ?? (t["addr:street"] ? `${typeLabel} on ${t["addr:street"]}` : typeLabel);

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
    description: t.operator ? `Operated by ${t.operator}.` : null,
    osm_tags: t,
  };
}

/**
 * Fetches one bbox, caching it on disk so an interrupted run resumes. If the
 * public servers keep timing out, the tile is split into four smaller ones.
 */
async function fetchTile(s: number, w: number, n: number, e: number, depth: number): Promise<OsmElement[]> {
  const bbox = `${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)}`;
  const tileCache = join(CACHE_DIR, "tiles", `${bbox.replace(/,/g, "_")}.json`);
  if (!REFRESH && existsSync(tileCache)) return JSON.parse(readFileSync(tileCache, "utf8"));
  try {
    const els = await overpass(`[out:json][timeout:90];nwr["amenity"="parking"](${bbox});out center tags;`, depth < 2 ? 4 : 8);
    mkdirSync(join(CACHE_DIR, "tiles"), { recursive: true });
    writeFileSync(tileCache, JSON.stringify(els));
    await sleep(1500); // be polite to the public Overpass servers
    return els;
  } catch (err) {
    if (depth >= 2) throw err;
    log(`  splitting ${bbox} into 4 smaller tiles`);
    const mLat = (s + n) / 2;
    const mLng = (w + e) / 2;
    const parts: OsmElement[] = [];
    for (const [a, b, c, d] of [[s, w, mLat, mLng], [s, mLng, mLat, e], [mLat, w, n, mLng], [mLat, mLng, n, e]]) {
      parts.push(...(await fetchTile(a, b, c, d, depth + 1)));
    }
    return parts;
  }
}

async function loadOsm(): Promise<Row[]> {
  const cacheFile = join(CACHE_DIR, `osm-${regionArg}.json`);
  let elements: OsmElement[];
  if (!REFRESH && existsSync(cacheFile)) {
    elements = JSON.parse(readFileSync(cacheFile, "utf8"));
    log(`OSM: using cached ${elements.length} elements (${cacheFile})`);
  } else {
    elements = [];
    const latStep = (region.n - region.s) / region.rows;
    const lngStep = (region.e - region.w) / region.cols;
    for (let r = 0; r < region.rows; r++) {
      for (let c = 0; c < region.cols; c++) {
        const s = region.s + r * latStep;
        const w = region.w + c * lngStep;
        log(`OSM tile ${r * region.cols + c + 1}/${region.rows * region.cols}`);
        elements.push(...(await fetchTile(s, w, s + latStep, w + lngStep, 0)));
      }
    }
    writeFileSync(cacheFile, JSON.stringify(elements));
  }
  const seen = new Set<string>();
  const rows = elements.map(osmToRow).filter((r): r is Row => r !== null && !seen.has(r.external_id) && Boolean(seen.add(r.external_id)));
  log(`OSM: ${elements.length} parking features → ${rows.length} usable public locations`);
  return rows;
}

// ---------------------------------------------------------------------------
// SFMTA meters (DataSF)
// ---------------------------------------------------------------------------
interface MeterGroup {
  blockface_id: string;
  street_name: string;
  num_from: string;
  num_to: string;
  lat: string;
  lng: string;
  meters: string;
  analysis_neighborhood?: string;
}

const PRICEY = new Set(["Financial District/South Beach", "South of Market", "Chinatown", "Tenderloin", "Nob Hill", "North Beach", "Mission Bay"]);
const MID = new Set(["Marina", "Mission", "Hayes Valley", "Castro/Upper Market", "Russian Hill", "Pacific Heights", "Potrero Hill", "Western Addition", "Japantown"]);

function titleStreet(s: string) {
  return s
    .toLowerCase()
    .replace(/\b0+(\d)/g, "$1")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_, n, suf) => n + suf.toLowerCase());
}

async function loadMeters(): Promise<Row[]> {
  const cacheFile = join(CACHE_DIR, "sfmta-meters.json");
  let groups: MeterGroup[];
  if (!REFRESH && existsSync(cacheFile)) {
    groups = JSON.parse(readFileSync(cacheFile, "utf8"));
    log(`SFMTA: using cached ${groups.length} block faces`);
  } else {
    const params = new URLSearchParams({
      $select: "blockface_id,street_name,min(street_num) as num_from,max(street_num) as num_to,avg(latitude) as lat,avg(longitude) as lng,count(*) as meters,analysis_neighborhood",
      // Grey caps = general metered parking (yellow/red are commercial & truck loading; green is 15–30 min).
      $where: "active_meter_flag='M' AND cap_color='Grey' AND latitude IS NOT NULL",
      $group: "blockface_id,street_name,analysis_neighborhood",
      $limit: "10000",
    });
    const res = await fetch(`https://data.sf.gov/resource/8vzz-qzz9.json?${params}`, { headers: { "User-Agent": UA }, redirect: "follow" });
    if (!res.ok) throw new Error(`DataSF request failed: ${res.status}`);
    groups = (await res.json()) as MeterGroup[];
    writeFileSync(cacheFile, JSON.stringify(groups));
  }
  const rows = groups
    .filter((g) => Number(g.meters) >= 2 && Number(g.lat) > 37 && Number(g.lng) < -122)
    .map((g): Row => {
      const street = titleStreet(g.street_name);
      const hood = g.analysis_neighborhood ?? null;
      const from = Number(g.num_from);
      const to = Number(g.num_to);
      return {
        external_id: `sfmta:blockface/${g.blockface_id}`,
        name: `${street} ${from === to ? from : `${from}–${to}`} meters`,
        address: `${from} ${street}, San Francisco, CA`,
        city: "San Francisco",
        geom: `SRID=4326;POINT(${Number(g.lng)} ${Number(g.lat)})`,
        type: "street",
        covered: false,
        ev_charging: false,
        accessible: false,
        total_spots: Number(g.meters),
        capacity_estimated: false,
        // SFMTA uses demand-responsive rates that change by block and time; we label ours as an estimate.
        hourly_price: hood && PRICEY.has(hood) ? 3.5 : hood && MID.has(hood) ? 2.75 : 2,
        price_estimated: true,
        source: "sfmta",
        opening_hours: { mon: [["09:00", "22:00"]], tue: [["09:00", "22:00"]], wed: [["09:00", "22:00"]], thu: [["09:00", "22:00"]], fri: [["09:00", "22:00"]], sat: [["09:00", "22:00"]], sun: [["12:00", "18:00"]] },
        description: `${g.meters} SFMTA metered spaces on this block face${hood ? ` in ${hood}` : ""}. Meter hours and rates are set by SFMTA and posted on each meter.`,
        osm_tags: null,
      };
    });
  log(`SFMTA: ${groups.length} block faces → ${rows.length} street locations`);
  return rows;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function upsert(rows: Row[], label: string) {
  const sb = db();
  const size = 150;
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size);
    const { error } = await sb.from("parking_locations").upsert(batch, { onConflict: "external_id" });
    if (error) throw new Error(`${label} batch ${i / size + 1}: ${error.message}`);
    process.stdout.write(`\r  ${label}: ${Math.min(i + size, rows.length)}/${rows.length}`);
  }
  process.stdout.write("\n");
}

const TEST_PASSWORD = process.env.SEED_TEST_PASSWORD || "ParkSmart-Demo-2026!";
const TEST_USERS = [
  { email: "driver@parksmart.test", name: "Dana Driver", role: "driver" },
  { email: "host@parksmart.test", name: "Harper Host", role: "host" },
  { email: "admin@parksmart.test", name: "Avery Admin", role: "admin" },
] as const;

async function seedUsers() {
  const sb = db();
  const ids: Record<string, string> = {};
  const { data: existing } = await sb.auth.admin.listUsers({ perPage: 1000 });
  for (const u of TEST_USERS) {
    let id = existing?.users.find((x) => x.email === u.email)?.id;
    if (!id) {
      const { data, error } = await sb.auth.admin.createUser({ email: u.email, password: TEST_PASSWORD, email_confirm: true, user_metadata: { full_name: u.name } });
      if (error) throw new Error(`Create ${u.email}: ${error.message}`);
      id = data.user.id;
    }
    ids[u.role] = id;
    const { error } = await sb.from("profiles").upsert({ id, name: u.name, role: u.role, vehicle_plate: u.role === "driver" ? "DEMO123" : null });
    if (error) throw new Error(`Profile ${u.email}: ${error.message}`);
  }
  await sb.from("vehicles").upsert({ user_id: ids.driver, plate: "DEMO123", label: "Demo car", is_default: true }, { onConflict: "user_id,plate" });

  // Two clearly-labelled demo host listings so host/booking flows can be tried end to end.
  const demo = [
    {
      external_id: "demo:host/mission-driveway",
      host_id: ids.host,
      name: "Demo listing — Mission driveway",
      address: "Valencia St & 20th St, San Francisco, CA",
      city: "San Francisco",
      geom: "SRID=4326;POINT(-122.42157 37.75878)",
      type: "private",
      covered: false,
      ev_charging: true,
      accessible: false,
      total_spots: 2,
      hourly_price: 4.5,
      source: "host",
      opening_hours: { always: true },
      description: "Test listing owned by the demo host account. Bookable with Stripe test cards.",
    },
    {
      external_id: "demo:host/soma-garage",
      host_id: ids.host,
      name: "Demo listing — SoMa private garage",
      address: "Folsom St & 6th St, San Francisco, CA",
      city: "San Francisco",
      geom: "SRID=4326;POINT(-122.40838 37.77697)",
      type: "garage",
      covered: true,
      ev_charging: false,
      accessible: true,
      total_spots: 12,
      hourly_price: 6,
      source: "host",
      opening_hours: { mon: [["06:00", "23:00"]], tue: [["06:00", "23:00"]], wed: [["06:00", "23:00"]], thu: [["06:00", "23:00"]], fri: [["06:00", "23:59"]], sat: [["08:00", "23:59"]], sun: [["08:00", "22:00"]] },
      description: "Test listing owned by the demo host account. Try the camera detection and AI pricing tools on it.",
    },
  ];
  const { error } = await sb.from("parking_locations").upsert(demo, { onConflict: "external_id" });
  if (error) throw new Error(`Demo listings: ${error.message}`);
  log(`Test accounts ready (password: ${TEST_PASSWORD}) + 2 demo host listings`);
}

/** Opt-in synthetic data, always flagged as sample. */
async function seedSample() {
  const sb = db();
  const { data: locs } = await sb.from("parking_locations").select("id, type, total_spots").or("source.eq.host,type.eq.garage").limit(60);
  const curve = (type: string, h: number, weekend: boolean) => {
    const base = type === "garage" ? [.15,.12,.1,.1,.1,.12,.2,.35,.6,.78,.85,.88,.88,.87,.85,.8,.7,.55,.5,.5,.45,.35,.25,.18] : [.1,.1,.1,.1,.1,.1,.12,.18,.25,.3,.3,.3,.3,.3,.3,.3,.28,.25,.22,.18,.15,.12,.1,.1];
    return Math.min(0.98, Math.max(0.02, base[h] * (weekend ? 0.8 : 1) + (Math.random() - 0.5) * 0.15));
  };
  const rows: { location_id: string; ts: string; occupied_count: number; total_spots: number; source: string }[] = [];
  const now = Date.now();
  for (const l of locs ?? []) {
    for (let hAgo = 24 * 28; hAgo > 0; hAgo -= 1) {
      const ts = new Date(now - hAgo * 3_600_000);
      const local = new Date(ts.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
      const rate = curve(l.type, local.getHours(), [0, 6].includes(local.getDay()));
      rows.push({ location_id: l.id, ts: ts.toISOString(), occupied_count: Math.round(rate * l.total_spots), total_spots: l.total_spots, source: "sample" });
    }
  }
  await sb.from("occupancy_history").delete().eq("source", "sample");
  for (let i = 0; i < rows.length; i += 2000) {
    const { error } = await sb.from("occupancy_history").insert(rows.slice(i, i + 2000));
    if (error) throw new Error(`Sample history: ${error.message}`);
  }
  const day = (d: number, h: number) => {
    const t = new Date();
    t.setDate(t.getDate() + d);
    t.setHours(h, 0, 0, 0);
    return t.toISOString();
  };
  await sb.from("events").delete().eq("is_sample", true);
  await sb.from("events").insert([
    { name: "Sample event: evening game", venue: "Oracle Park", geom: "SRID=4326;POINT(-122.3893 37.7786)", starts_at: day(1, 18), ends_at: day(1, 22), impact: 0.45, is_sample: true },
    { name: "Sample event: arena concert", venue: "Chase Center", geom: "SRID=4326;POINT(-122.3877 37.768)", starts_at: day(2, 19), ends_at: day(2, 23), impact: 0.4, is_sample: true },
  ]);
  log(`Sample data: ${rows.length} synthetic history rows (source='sample') + 2 sample events`);
}

// ---------------------------------------------------------------------------
async function main() {
  log(`Region: ${regionArg}${DRY ? " (dry run)" : ""}`);
  const osm = args.has("--skip-osm") ? [] : await loadOsm();
  const meters = args.has("--skip-meters") || regionArg === "none" ? [] : await loadMeters();

  if (DRY) {
    writeFileSync(join(CACHE_DIR, "preview-locations.json"), JSON.stringify([...osm.slice(0, 50), ...meters.slice(0, 50)], null, 2));
    const est = osm.filter((r) => r.price_estimated).length;
    log(`Dry run: ${osm.length} OSM + ${meters.length} meter locations (${est} OSM prices estimated). Preview → supabase/seed-data/preview-locations.json`);
    return;
  }

  if (!args.has("--skip-users")) await seedUsers();
  if (osm.length) await upsert(osm, "OSM locations");
  if (meters.length) await upsert(meters, "SFMTA meter locations");
  if (SAMPLE) await seedSample();

  const { data: tick, error } = await db().rpc("tick");
  if (error) console.warn("  tick() failed:", error.message);
  else log("Availability refreshed", tick);
  log("Done.");
}

main().catch((err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
