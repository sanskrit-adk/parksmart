# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

**Next.js 16 / React 19.3:** APIs differ from older versions (e.g. middleware is `src/proxy.ts` exporting `proxy()`). Check `node_modules/next/dist/docs/` before writing Next-specific code.

## Commands

```bash
npm run dev            # http://localhost:3000
npm run build
npm run lint
npm run typecheck      # next typegen && tsc --noEmit (route types are generated)
npm run test:db        # applies all migrations to in-memory PGlite+PostGIS and runs DB checks (RLS, booking constraint, pricing, tick, ...)
npm run check:env      # tests each configured key against its real service
npm run db:migrate     # applies supabase/migrations/*.sql in order via SUPABASE_DB_URL, tracked in public._parksmart_migrations
npm run seed -- --region sf   # real OSM + SFMTA data and test accounts; flags: --dry-run --refresh --sample-data --skip-osm/--skip-meters/--skip-users
python services/cv/test_spots.py   # CV space-count logic
npx tsx scripts/realtime-check.ts  # books a space, confirms the Realtime update arrives
```

There is no JS unit test runner; `test:db` is the main test suite. `node scripts/test-db.mjs <migrations-dir>` runs it against another directory.

Local dev on Windows: Supabase runs in WSL via the Supabase CLI; `start-parksmart.cmd` starts the DB and site. Test accounts (`driver@`, `host@`, `admin@parksmart.test`, password `SEED_TEST_PASSWORD`, default `ParkSmart-Demo-2026!`).

## Architecture

- **Business logic lives in Postgres** (`supabase/migrations`): `create_booking_hold()` picks a free space, prices it and holds it; an exclusion constraint on `bookings` prevents double-booking; `tick()` (pg_cron every minute, or `/api/cron/tick` with `CRON_SECRET`) drives the booking lifecycle and availability; prediction/forecast functions (`predict_occupancy_rate`, `location_forecast`, `free_probability`) and `nearby_locations`/`locations_in_bounds` (PostGIS). RLS gates every table; a trigger blocks role escalation (only admins grant admin). Schema changes go in a new migration and should get a check in `scripts/test-db.mjs`.
- **Next.js app** (`src/app`): pages plus API routes in `src/app/api`. `src/proxy.ts` refreshes the Supabase session and protects `/bookings`, `/profile`, `/host`, `/admin`, `/book`, `/check-in`, `/checkout`. Supabase clients: `src/lib/supabase/{client,server}.ts`. The service-role key is server-only and used for payments, detections and seeding.
- **Secrets:** read only via `serverEnv()` in `src/lib/env.ts` from `server-only` modules; the browser sees only `NEXT_PUBLIC_*`.
- **Graceful degradation is a core design rule.** Every external service has a fallback, and the UI labels it honestly:
  - No Mapbox token → MapLibre + OpenFreeMap tiles + Photon geocoding (`src/lib/map-engine.ts`, `geocode.ts`; `postinstall` copies the map worker).
  - No Stripe key → simulated checkout (`/checkout/simulated`, dev or `ALLOW_SIMULATED_PAYMENTS=true`).
  - No OpenAI key → rule-based search parser, deterministic pricing/insights (`src/lib/ai/*`).
  - Estimated data is flagged (`capacity_estimated`, `price_estimated`, `source='sample'`, `is_sample`) and shown as "est." in the UI. Keep these flags accurate.
- **Payments:** `POST /api/bookings` → hold → Stripe Checkout. Both the webhook and the confirmation page call the idempotent `applyCheckoutSession()`, which refunds automatically if the hold expired and the space was taken. Extend/cancel follow refund rules (full >1h before start, 50% within 1h, none after start).
- **CV service** (`services/cv`, FastAPI + YOLOv8, Docker): `POST /detect` returns free/occupied counts; called through `/api/cv/detect` (`CV_SERVICE_URL`/`CV_SERVICE_TOKEN`), falling back to a vision LLM.
- **UI:** Tailwind v4, shadcn/ui on Base UI (`components.json`), PWA (`public/sw.js`, `app/manifest.ts`).
