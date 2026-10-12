# ParkSmart: AI parking for the San Francisco Bay Area

A mobile-first, installable (PWA) web app to find, predict, book and pay for parking. It uses real OpenStreetMap and SFMTA data, a Supabase/PostGIS backend, Stripe test payments, and AI in every main flow.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui (Base UI) · Framer Motion · Mapbox GL JS · Supabase (Postgres + PostGIS, Auth, Realtime, Storage, RLS, pg_cron) · OpenAI · Stripe · Python FastAPI + YOLOv8 · Vercel

---

## Contents

1. [Quick start](#quick-start)
2. [Environment variables](#environment-variables)
3. [Database & seed data](#database--seed-data)
4. [Test accounts](#test-accounts)
5. [Payments (Stripe test mode)](#payments-stripe-test-mode)
6. [Deploying](#deploying)
7. [The AI features](#the-ai-features)
8. [Live vs estimated availability](#live-vs-estimated-availability)
9. [Project structure](#project-structure)
10. [Testing](#testing)
11. [Known limitations](#known-limitations)

---

## Quick start

Prerequisites: Node.js 20.9+, a free [Supabase](https://supabase.com) project, a [Mapbox](https://mapbox.com) token, a [Stripe](https://stripe.com) account (test mode) and an [OpenAI](https://platform.openai.com) API key. Docker is optional (for the CV service).

```bash
npm install
cp .env.example .env.local          # fill in the keys (see below)

npm run check:env                   # tests every key against the real service
npm run setup                       # check:env → db:migrate → seed (SF): schema, real data, test accounts
npm run dev                         # http://localhost:3000

# Individually:
npm run db:migrate                  # applies supabase/migrations via SUPABASE_DB_URL (tracked, re-runnable)
npm run seed -- --region sf         # San Francisco only, ~2–5 min
# npm run seed                      # whole Bay Area (16 Overpass tiles, slower)
# Alternatively: npx supabase link + npx supabase db push, or paste the SQL files into the SQL editor.

# 4. Payments locally (separate terminal)
stripe listen --forward-to localhost:3000/api/stripe/webhook   # copy the whsec_ into .env.local
```

The booking confirmation page also reconciles the Stripe session directly. Bookings therefore confirm locally even without `stripe listen`; the webhook is still recommended so payments that finish in another tab are recorded.

### Supabase dashboard settings

- **Authentication → URL configuration:** set *Site URL* to your app URL, and add `http://localhost:3000/auth/callback` and `https://YOUR-DOMAIN/auth/callback` to *Redirect URLs*.
- **Authentication → Providers → Google:** enable it with a Google OAuth client ID/secret. The authorised redirect URI is `https://YOUR-PROJECT.supabase.co/auth/v1/callback`.
- **Database → Extensions:** `postgis`, `btree_gist` and `pg_cron` are created by the migrations. If `pg_cron` is not allowed on your plan, skip `20261012000004_cron.sql` and use Vercel Cron (see [Deploying](#deploying)).
- **Realtime:** the migration adds `parking_locations`, `bookings` and `notifications` to the `supabase_realtime` publication.

---

## Environment variables

Every key is listed with comments in [`.env.example`](.env.example).

| Variable | Where | Required | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | client | yes | Canonical URL for metadata |
| `NEXT_PUBLIC_SUPABASE_URL` | client | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | yes | Public anon key (RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server** | yes | Payments, detections, seed. Never exposed to the browser |
| `SUPABASE_DB_URL` | **server** | for setup | Postgres connection string used by `db:migrate` / `check:env` |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | client | yes | Map, geocoding autocomplete, static map images |
| `OPENAI_API_KEY` | **server** | recommended | All LLM/vision features |
| `OPENAI_MODEL` / `OPENAI_VISION_MODEL` | server | no | Defaults to `gpt-4.1-mini` |
| `STRIPE_SECRET_KEY` | **server** | yes (to book paid spots) | Checkout & refunds, test mode |
| `STRIPE_WEBHOOK_SECRET` | **server** | yes in prod | Verifies Stripe webhooks |
| `CV_SERVICE_URL` / `CV_SERVICE_TOKEN` | **server** | no | YOLOv8 detection service |
| `CRON_SECRET` | **server** | no | Protects `/api/cron/tick` if you use Vercel Cron |

API keys are only read in server code (`src/lib/env.ts` → `serverEnv()`, modules marked `server-only`). The browser only sees `NEXT_PUBLIC_*` values.

**Graceful degradation:** without `OPENAI_API_KEY`, AI search uses a rule-based parser, pricing and insights use deterministic formulas, and the assistant answers searches only. The UI says so ("Basic parser", "Rule-based estimate") rather than pretending.

---

## Database & seed data

Migrations live in [`supabase/migrations`](supabase/migrations):

| File | Contents |
|---|---|
| `…001_schema.sql` | Tables: `profiles`, `vehicles`, `parking_locations` (PostGIS `geography(Point)`), `spots`, `bookings` (with an **exclusion constraint** that makes double-booking impossible), `booking_extensions`, `occupancy_history`, `ai_detections`, `events`, `ai_insights`, `reviews`, `favorites`, `notifications` |
| `…002_functions.sql` | `nearby_locations()` (the PostGIS "nearby spots" search), `locations_in_bounds()`, `predict_occupancy_rate()`, `location_forecast()`, `free_probability()`, `refresh_availability()`, `create_booking_hold()`, `tick()`, dashboards, triggers (sign-up → profile, ratings, notifications, role-escalation guard) |
| `…003_rls.sql` | Row Level Security for every table, storage buckets + policies, Realtime publication |
| `…004_cron.sql` | `pg_cron`: `tick()` every minute (booking lifecycle + availability), history pruning |

### Seed script (`npm run seed`)

[`scripts/seed.ts`](scripts/seed.ts) imports **real** data:

- **Garages and lots:** OpenStreetMap `amenity=parking` via the Overpass API, tiled over the Bay Area with retries and mirror fallback. It keeps public places with a name, a capacity of 10 or more, or a garage structure, and drops private/customer-only parking.
- **Street meters:** SFMTA *Parking Meters* (DataSF `8vzz-qzz9`), active general-use (grey cap) meters, grouped by block face. That is about 2,500 SF locations.
- **Test accounts** and two clearly labelled demo host listings.

Downloads are cached in `supabase/seed-data/` (git-ignored); re-runs are idempotent (upsert on `external_id`).

| Flag | Effect |
|---|---|
| `--region sf` | San Francisco only (default `bayarea`) |
| `--dry-run` | Fetch + transform, write a preview JSON, don't touch the DB |
| `--refresh` | Ignore the download cache |
| `--sample-data` | Also add 4 weeks of **synthetic** occupancy history (`source='sample'`) and two sample events (`is_sample=true`), so prediction charts have shape immediately. Off by default. |
| `--skip-osm`, `--skip-meters`, `--skip-users` | Skip a part |

**Honesty in the data:** if OSM has no capacity or price, or SFMTA's demand-responsive rate isn't in the meter dataset, the seed estimates it and sets `capacity_estimated` / `price_estimated`. The UI shows "est. price", "~$3", "About 250 spaces (estimated)".

---

## Test accounts

Created by `npm run seed` (password from `SEED_TEST_PASSWORD`, default `ParkSmart-Demo-2026!`):

| Role | Email | Try |
|---|---|---|
| Driver | `driver@parksmart.test` | AI search, booking, extend/cancel, plate check-in with plate `DEMO123` |
| Host | `host@parksmart.test` | Host dashboard, two demo listings, AI price suggestion, camera detection |
| Admin | `admin@parksmart.test` | Admin dashboard: live map, charts, bookings, users, CV, AI insights |

New sign-ups are drivers. A driver becomes a host by publishing a listing. Only admins can grant admin (enforced by a database trigger, not just the UI).

---

## Payments (Stripe test mode)

1. **Reserve:** `POST /api/bookings` calls `create_booking_hold()`. That picks a free space, prices it in SQL, and holds it for 32 minutes.
2. A Stripe Checkout Session is created (test card `4242 4242 4242 4242`, any future date, any CVC).
3. **Confirm:** the webhook (`checkout.session.completed`) and the confirmation page both call `applyCheckoutSession()`, which is idempotent. If the hold expired and someone else took the space, the payment is refunded automatically.
4. **Extend:** priced for the extra time, paid through a new Checkout session, and checked for conflicts with the next booking.
5. **Cancel:** refund rule: full refund more than 1 hour before start; 50% of the parking cost within 1 hour; none after start. Refunds go through the Stripe Refunds API.

Webhook events to enable: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`.

---

## Deploying

### Web app → Vercel

1. Push the repo and import it in Vercel (framework preset **Next.js**, root = this folder).
2. Add every variable from `.env.example` in *Settings → Environment Variables*, with `NEXT_PUBLIC_SITE_URL` set to your production URL.
3. In Stripe, add a webhook endpoint `https://YOUR-DOMAIN/api/stripe/webhook` and copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Add your domain to Supabase Auth redirect URLs and restrict the Mapbox token to it.
5. **Cron:** `pg_cron` (migration 004) already runs `tick()` every minute inside Supabase. If you can't use pg_cron, set `CRON_SECRET` and add a cron to `vercel.json`:
   ```json
   "crons": [{ "path": "/api/cron/tick", "schedule": "*/5 * * * *" }]
   ```
   Vercel Hobby only allows daily crons; use pg_cron or an external scheduler for higher frequency.

### CV service → any container host (Fly.io, Railway, Render, Cloud Run)

```bash
cd services/cv
docker build -t parksmart-cv .
docker run -p 8000:8000 -e CV_SERVICE_TOKEN=change-me parksmart-cv
curl localhost:8000/health
```

Then set `CV_SERVICE_URL=https://your-cv-host` and the same `CV_SERVICE_TOKEN` in Vercel.

---

## The AI features

| # | Feature | Where | How it works |
|---|---|---|---|
| 1 | **AI search bar** | Home hero, Find page | `POST /api/ai/search`: an LLM call with a strict JSON schema converts e.g. *"cheap covered parking near SFBU for 2 hours under $15, EV charging"* into filters (place, radius, duration, arrival time, max hourly/total price, covered, EV, accessible, types, sort). The place is geocoded (Mapbox), then `nearby_locations()` runs the PostGIS query. A rule-based parser is the fallback. |
| 2 | **Availability prediction** | Every result, spot page, booking flow | `predict_occupancy_rate()` blends a type/weekday/hour prior with observed history for the same weekday and hour (8 weeks), adds ParkSmart bookings at that time and nearby events, and uses fresh camera counts when present. `free_probability()` turns that into "Likely free when you arrive (85%)", with model uncertainty included. `location_forecast()` powers the 24-hour chart and the "best time to arrive" hint. |
| 3 | **Smart recommendations** | Find page, assistant | `src/lib/ai/recommend.ts` scores each result on predicted availability (35%), walking distance (25%), price (15–35% depending on your price sensitivity), rating (10%) and preferences (covered/EV/accessible, max walk), with a total-budget penalty. The top result gets **AI Pick**, and every result gets a one-line reason built from the factors that drove its score ("Closest under $10 with 90% chance of being free"). |
| 4 | **Parking assistant** | Floating chat button, every page | `POST /api/ai/chat` runs OpenAI function calling over the app's own services: `search_parking`, `get_location_details`, `list_my_bookings`, `propose_booking`, `propose_extension`, `propose_cancellation`. Tools that involve money only *propose*; the UI shows a confirmation card, and the real API is called only after you press **Confirm & pay** / **Cancel booking**. |
| 5 | **Camera spot detection** | Admin → Camera, Host → listing → Camera | Upload a photo or give an https camera snapshot URL. `POST /api/cv/detect` uses the **YOLOv8** service (`services/cv`) when configured, otherwise a vision LLM. The image is stored, boxes are drawn over it, and the counts make the lot **Live** for 30 minutes and feed `occupancy_history`. |
| 6 | **Plate check-in** | `/check-in` | Photograph your plate. A vision model reads it, it's matched to your saved vehicles, and your booking starting within 30 minutes is checked in automatically. If you have no booking, it suggests the nearest lot to start one. Photos are processed in memory and never stored. |
| 7 | **Dynamic pricing for hosts** | Listing wizard, Host → AI pricing | A deterministic baseline from real comparables within 1 km (median price), current nearby occupancy, the listing's 30-day occupancy, amenities and time-of-day demand. The LLM then reasons over the same evidence (bounded to ±25–50% of the baseline) and returns a price, range, peak/off-peak prices and plain-English reasons. **Apply suggestion** updates the listing. |
| 8 | **AI insights** | Admin → AI insights | `admin_daily_metrics()` aggregates bookings, revenue, the 14-day revenue trend, bookings and occupancy by hour, busiest lots, no-shows, abandoned checkouts and cancellations. The LLM writes a briefing with peak hours, busiest lots, trend, flagged anomalies and recommendations. Briefings are stored in `ai_insights`. |

---

## Live vs estimated availability

Most public parking has no sensors, so the app is explicit about what it knows:

- **Live:** host-managed inventory (every space is booked through ParkSmart, so counts are exact), or a camera count from the last 30 minutes.
- **Estimated:** total capacity × (1 − time-of-day occupancy prior), minus ParkSmart bookings.

`refresh_availability()` recomputes these on every booking change (trigger) and every minute (`tick()`). Changes to `parking_locations` are pushed by **Supabase Realtime** to every open map, list, and the admin live map.

Seeded public locations expose a capped pool of up to 20 ParkSmart-bookable spaces each. Host listings expose all their spaces.

---

## Project structure

```
parksmart/
├─ src/
│  ├─ app/                    # routes (App Router)
│  │  ├─ page.tsx             # home: hero + AI search, live stats, How AI helps, reviews
│  │  ├─ find/                # list + map split view, mobile bottom sheet
│  │  ├─ spots/[id]/          # spot details + forecast + reviews
│  │  ├─ book/[id]/           # time → review → Stripe
│  │  ├─ bookings/            # tabs; [id] = confirmation, QR, calendar
│  │  ├─ check-in/            # plate recognition
│  │  ├─ host/                # dashboard, new (wizard), listings/[id]
│  │  ├─ admin/               # admin dashboard
│  │  ├─ login, signup, reset-password, profile, about, offline
│  │  ├─ api/                 # route handlers (AI, bookings, Stripe, CV, cron, search)
│  │  └─ manifest.ts, icons/  # PWA
│  ├─ components/             # ui/ (shadcn), map/, parking/, booking/, ai/, host/, admin/, home/
│  ├─ lib/                    # supabase/, ai/, bookings, pricing, search, geocode, schemas…
│  └─ proxy.ts                # session refresh + route protection (Next 16 "proxy")
├─ supabase/migrations/       # SQL schema, functions, RLS, cron
├─ scripts/seed.ts            # OSM + SFMTA import, test accounts
├─ scripts/test-db.mjs        # migration test suite (PGlite + PostGIS)
├─ services/cv/               # FastAPI + YOLOv8 detection service (Dockerfile)
└─ public/sw.js               # service worker (offline fallback, cached QR pages)
```

---

## Testing

```bash
npm run typecheck     # route types + TypeScript
npm run lint
npm run build
npm run test:db       # applies all migrations to in-memory Postgres+PostGIS and runs 30 checks:
                      # RLS, role-escalation guard, double-booking constraint, holds, pricing,
                      # predictions, forecast, tick lifecycle, CV → live, reviews, dashboards
python services/cv/test_spots.py   # detection → space-count logic
```

---

## Known limitations

- **Estimated data is labelled, not hidden.** Most OSM lots have no published price or capacity, and SFMTA rates vary by block and time. Treat "est." values as guidance.
- **Bookings at public garages and meters are app-level reservations.** In production you'd integrate operator APIs (e.g. garage PARCS or SFMTA payment) to honour them on site.
- **YOLOv8 (COCO) detects vehicles, not empty bays.** Without a bay layout the service reports free = expected − occupied. Pass a `layout` to `/detect` for per-bay free/occupied boxes. Vision-LLM boxes are approximate and labelled as such.
- **Sample data** (`--sample-data`) is synthetic and flagged in the database (`source='sample'`, `is_sample=true`). Leave it off in production.
- **Homepage reviews** come only from real reviews of completed bookings, so the section shows a placeholder message until drivers leave some.
