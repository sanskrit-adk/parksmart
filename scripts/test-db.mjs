import { PGlite } from "@electric-sql/pglite";
import { postgis } from "@electric-sql/pglite-postgis";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Applies supabase/migrations to an in-memory Postgres (PGlite + PostGIS) with
// stubbed Supabase auth/storage schemas, then exercises RLS, bookings and AI functions.
const migDir = process.argv[2] ?? fileURLToPath(new URL("../supabase/migrations", import.meta.url));
const db = new PGlite({ extensions: { postgis, btree_gist } });

const stubs = `
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
create publication supabase_realtime;
-- Supabase defaults: API roles get table privileges, RLS does the gating.
grant usage on schema public, auth, storage to anon, authenticated, service_role;
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
grant select on storage.objects to anon, authenticated;
`;
await db.exec(stubs);

for (const f of readdirSync(migDir).sort()) {
  if (f.includes("cron")) continue;
  try {
    await db.exec(readFileSync(join(migDir, f), "utf8"));
    console.log("applied", f);
  } catch (e) {
    console.error("FAILED", f, e.message, e.position ?? "");
    process.exit(1);
  }
}
await db.exec("set search_path = public, extensions;");

const q = async (sql, params) => (await db.query(sql, params)).rows;
const as = async (uid) => {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);
                 select set_config('request.jwt.claims', '${uid ? JSON.stringify({ sub: uid, role: "authenticated" }) : "{}"}', false);`);
};
const check = (name, cond, extra) => {
  console.log(cond ? "  ok  " : "  FAIL", name, extra !== undefined ? JSON.stringify(extra) : "");
  if (!cond) process.exitCode = 1;
};

const driver = "11111111-1111-1111-1111-111111111111";
const host = "22222222-2222-2222-2222-222222222222";
const other = "33333333-3333-3333-3333-333333333333";
await q(`insert into auth.users (id, email, raw_user_meta_data) values
  ($1, 'driver@x.test', '{"full_name":"Dana Driver"}'), ($2, 'host@x.test', '{}'), ($3, 'o@x.test', '{}')`, [driver, host, other]);
check("profiles created by trigger", (await q("select count(*)::int c from profiles"))[0].c === 3);
check("profile name from metadata", (await q("select name from profiles where id=$1", [driver]))[0].name === "Dana Driver");

// role guard
await as(driver);
let err = null;
try { await q("update profiles set role='admin' where id=$1", [driver]); } catch (e) { err = e.message; }
check("driver cannot self-promote to admin", err?.includes("Not allowed"), err);
await q("update profiles set role='host' where id=$1", [host]).catch(() => {});
await as(host);
await q("update profiles set role='host' where id=$1", [host]);
check("driver may opt in to host", (await q("select role from profiles where id=$1", [host]))[0].role === "host");
await as(null);

// locations
await q(`insert into parking_locations (external_id, name, geom, type, covered, total_spots, hourly_price, source, opening_hours)
  values ('osm:node/1', 'Civic Center Garage', st_point(-122.4175, 37.7803)::geography, 'garage', true, 840, 4.5, 'osm', '{"always":true}'),
         ('sfmta:blockface/1', 'Kearny St 900 block', st_point(-122.4053, 37.7968)::geography, 'street', false, 8, 3, 'sfmta', null)`);
const [hostLoc] = await q(`insert into parking_locations (host_id, name, geom, type, total_spots, hourly_price, source, opening_hours)
  values ($1, 'Driveway on Fell', st_point(-122.42, 37.776)::geography, 'private', 1, 6, 'host',
  '{"mon":[["07:00","22:00"]],"tue":[["07:00","22:00"]],"wed":[["07:00","22:00"]],"thu":[["07:00","22:00"]],"fri":[["07:00","22:00"]],"sat":[["00:00","00:00"]],"sun":[["00:00","00:00"]]}') returning id`, [host]);
const spots = await q("select l.name, count(s.id)::int n from parking_locations l left join spots s on s.location_id=l.id group by l.name order by l.name");
check("spots generated (capped 20 for public, all for host)", spots.find(r => r.name === "Civic Center Garage").n === 20 && spots.find(r => r.name === "Driveway on Fell").n === 1, spots);
const avail = await q("select name, available_now, availability_mode from parking_locations order by name");
check("availability computed", avail.every(a => a.available_now !== null && a.availability_mode), avail);
check("host location is live", avail.find(a => a.name === "Driveway on Fell").availability_mode === "live");

// geo search as anon
await as(null);
const near = await q("select name, round(distance_m) d, predicted_rate, free_probability, is_open from nearby_locations(37.78, -122.418, 3000)");
check("nearby_locations returns sorted results", near.length === 3 && near[0].d <= near[1].d, near);
const filtered = await q("select name from nearby_locations(37.78, -122.418, 3000, now(), 5, true)");
check("filters: max price + covered", filtered.length === 1 && filtered[0].name === "Civic Center Garage", filtered);
const bounds = await q("select count(*)::int c from locations_in_bounds(-122.5, 37.7, -122.3, 37.85)");
check("locations_in_bounds", bounds[0].c === 3);

// is_open_at
const open = await q(`select
  is_open_at('{"mon":[["08:00","20:00"]]}', 'America/Los_Angeles', '2026-10-12 12:00:00-07') a,
  is_open_at('{"mon":[["08:00","20:00"]]}', 'America/Los_Angeles', '2026-10-12 21:00:00-07') b,
  is_open_at('{"mon":[["18:00","02:00"]]}', 'America/Los_Angeles', '2026-10-12 23:00:00-07') c,
  is_open_at(null, 'America/Los_Angeles', now()) d`);
check("is_open_at", open[0].a === true && open[0].b === false && open[0].c === true && open[0].d === null, open[0]);

// booking holds
await as(driver);
const start = "date_trunc('hour', now()) + interval '2 hours'";
const [b1] = await q(`select * from create_booking_hold($1, ${start}, ${start} + interval '2 hours', 'abc 123')`, [hostLoc.id]);
check("hold created", b1.status === "pending_payment" && Number(b1.total_price) === 12.6 && b1.vehicle_plate === "ABC123", { status: b1.status, total: b1.total_price, plate: b1.vehicle_plate, breakdown: b1.price_breakdown });
await as(other);
err = null;
try { await q(`select * from create_booking_hold($1, ${start} + interval '1 hour', ${start} + interval '3 hours')`, [hostLoc.id]); } catch (e) { err = e.message; }
check("overlapping booking on 1-spot listing rejected", err?.includes("No bookable spaces"), err);
const [b2] = await q(`select * from create_booking_hold($1, ${start} + interval '2 hours', ${start} + interval '3 hours')`, [hostLoc.id]);
check("back-to-back booking allowed", !!b2.id);
err = null;
try {
  await as(null);
  await q(`insert into bookings (user_id, spot_id, location_id, start_time, end_time, status) values ($1, $2, $3, ${start}, ${start} + interval '1 hour', 'upcoming')`, [other, b1.spot_id, hostLoc.id]);
} catch (e) { err = e.message; }
check("exclusion constraint blocks direct overlapping insert", err?.includes("bookings_no_overlap"), err);
await as(driver);
err = null;
try { await q(`select * from create_booking_hold($1, now() - interval '1 day', now())`, [hostLoc.id]); } catch (e) { err = e.message; }
check("past start rejected", err?.includes("past"), err);

// RLS
await db.exec("set role authenticated");
await as(driver);
const mine = await q("select id from bookings");
check("RLS: driver sees only own bookings", mine.length === 1 && mine[0].id === b1.id, mine.length);
await as(host);
const hostSees = await q("select id from bookings");
check("RLS: host sees bookings on own listing", hostSees.length === 2, hostSees.length);
await as(other);
err = null;
try { await q("insert into parking_locations (host_id, name, geom, type, total_spots, hourly_price, source) values ($1,'x',st_point(0,0)::geography,'private',1,1,'host')", [other]); } catch (e) { err = e.message; }
check("RLS: driver cannot create listing", err?.includes("row-level security"), err);
const anonPred = await q("select predict_occupancy_rate($1, (date_trunc('hour', now()) + interval '2 hours 30 minutes')) r", [hostLoc.id]);
check("prediction counts others' bookings despite RLS", Number(anonPred[0].r) >= 0.99 - 1e-9, anonPred[0]);
await db.exec("reset role");

// confirm payment -> notification, availability
await as(null);
await q("update bookings set status='upcoming', stripe_payment_id='pi_test' where id=$1", [b1.id]);
const notes = await q("select title from notifications where user_id=$1", [driver]);
check("confirmation notification", notes.some(n => n.title === "Booking confirmed"), notes);

// make it active now and check-in -> occupied/live count
await q("update bookings set start_time = now() - interval '5 minutes', end_time = now() + interval '1 hour', status='active', checked_in_at=now() where id=$1", [b1.id]);
const spot = await q("select status from spots where id=$1", [b1.spot_id]);
const hostAvail = await q("select available_now, availability_mode from parking_locations where id=$1", [hostLoc.id]);
check("check-in marks spot occupied & live count 0", spot[0].status === "occupied" && hostAvail[0].available_now === 0, { spot: spot[0], hostAvail: hostAvail[0] });

// forecast + tick
const fc = await q("select * from location_forecast((select id from parking_locations where name='Civic Center Garage'))");
check("forecast returns 24 hourly points", fc.length === 24 && fc.every(r => Number(r.occupancy_rate) > 0), fc.slice(0, 3));
await q("update bookings set hold_expires_at = now() - interval '1 minute' where id=$1", [b2.id]);
const t = await q("select tick() r");
check("tick expires stale holds", t[0].r.expired === 1, t[0].r);
const t2 = await q("select tick() r");
check("tick is idempotent", t2[0].r.expired === 0, t2[0].r);

// detection -> live + history
await q("insert into ai_detections (location_id, image_url, free_count, occupied_count, model) select id, 'x', 30, 70, 'test' from parking_locations where name='Civic Center Garage'");
const cv = await q("select available_now, availability_mode from parking_locations where name='Civic Center Garage'");
check("CV detection makes location live", cv[0].availability_mode === "live" && cv[0].available_now === 30, cv[0]);

// reviews
await q("update bookings set status='completed' where id=$1", [b1.id]);
await db.exec("set role authenticated");
await as(driver);
await q("insert into reviews (user_id, location_id, booking_id, rating, comment) values ($1, $2, $3, 4, 'Easy access')", [driver, hostLoc.id, b1.id]);
await as(other);
err = null;
try { await q("insert into reviews (user_id, location_id, rating) values ($1, $2, 5)", [other, hostLoc.id]); } catch (e) { err = e.message; }
check("RLS: review requires completed booking", err?.includes("row-level security"), err);
await db.exec("reset role");
await as(null);
const rated = await q("select rating, review_count from parking_locations where id=$1", [hostLoc.id]);
check("rating synced", Number(rated[0].rating) === 4 && rated[0].review_count === 1, rated[0]);

// dashboards
const stats = await q("select public_stats() s");
check("public_stats", stats[0].s.locations === 3, stats[0].s);
await db.exec(`select set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
const metrics = await q("select admin_daily_metrics() m");
check("admin_daily_metrics", typeof metrics[0].m.bookings === "number", metrics[0].m);
await as(host);
const earn = await q("select * from host_earnings(7)");
check("host_earnings 7 days", earn.length === 7, earn.slice(-2));

console.log(process.exitCode ? "\nSOME CHECKS FAILED" : "\nALL CHECKS PASSED");


