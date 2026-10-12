-- ParkSmart core schema
-- Postgres 15+ / Supabase. PostGIS lives in the `extensions` schema (Supabase default).

set search_path = public, extensions;

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('driver', 'host', 'admin');
create type public.location_type as enum ('garage', 'lot', 'street', 'private');
create type public.location_source as enum ('osm', 'sfmta', 'host');
create type public.spot_status as enum ('free', 'reserved', 'occupied');
create type public.booking_status as enum ('pending_payment', 'upcoming', 'active', 'completed', 'cancelled');

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  phone text,
  role public.user_role not null default 'driver',
  vehicle_plate text,
  avatar_url text,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plate text not null check (plate ~ '^[A-Z0-9]{2,8}$'),
  label text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, plate)
);
create index vehicles_plate_idx on public.vehicles (plate);

-- ---------------------------------------------------------------------------
-- Parking inventory
-- ---------------------------------------------------------------------------
create table public.parking_locations (
  id uuid primary key default gen_random_uuid(),
  host_id uuid references public.profiles (id) on delete set null,
  external_id text unique,                 -- e.g. osm:way/123, sfmta:blockface/520091
  name text not null,
  address text,
  city text,
  description text,
  geom geography(Point, 4326) not null,
  -- Plain coordinates for API consumers (PostgREST returns geography as EWKB hex).
  lat double precision generated always as (st_y(geom::geometry)) stored,
  lng double precision generated always as (st_x(geom::geometry)) stored,
  type public.location_type not null,
  covered boolean not null default false,
  ev_charging boolean not null default false,
  accessible boolean not null default false,
  total_spots integer not null check (total_spots > 0),
  capacity_estimated boolean not null default false,
  hourly_price numeric(8, 2) not null check (hourly_price >= 0),
  price_estimated boolean not null default false,
  photos text[] not null default '{}',
  rating numeric(2, 1),
  review_count integer not null default 0,
  source public.location_source not null,
  -- {"always": true} or {"mon": [["08:00","20:00"]], "tue": [...], ...}; null = hours not listed
  opening_hours jsonb,
  timezone text not null default 'America/Los_Angeles',
  blackout_dates date[] not null default '{}',
  is_active boolean not null default true,
  osm_tags jsonb,
  -- Maintained by public.refresh_availability()
  available_now integer,
  availability_mode text check (availability_mode in ('live', 'estimated')),
  occupancy_rate numeric(4, 3),
  availability_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index parking_locations_geom_idx on public.parking_locations using gist (geom);
create index parking_locations_host_idx on public.parking_locations (host_id);
create index parking_locations_price_idx on public.parking_locations (hourly_price);

-- Bookable spaces. Seeded public locations expose a capped pool of
-- ParkSmart-bookable spaces; host listings expose every space.
create table public.spots (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.parking_locations (id) on delete cascade,
  label text not null,
  status public.spot_status not null default 'free',
  updated_at timestamptz not null default now(),
  unique (location_id, label)
);
create index spots_location_idx on public.spots (location_id);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  spot_id uuid not null references public.spots (id) on delete restrict,
  location_id uuid not null references public.parking_locations (id) on delete restrict,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status public.booking_status not null default 'pending_payment',
  total_price numeric(10, 2) not null default 0,
  price_breakdown jsonb not null default '{}'::jsonb,
  vehicle_plate text,
  stripe_checkout_session_id text,
  stripe_payment_id text,
  qr_code text not null default replace(gen_random_uuid()::text, '-', ''),
  hold_expires_at timestamptz,
  checked_in_at timestamptz,
  ending_notified boolean not null default false,
  refund_amount numeric(10, 2),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_time_order check (end_time > start_time),
  constraint bookings_max_duration check (end_time - start_time <= interval '72 hours'),
  -- No two live bookings may overlap on the same spot. This is what makes
  -- concurrent "Reserve" clicks safe.
  constraint bookings_no_overlap exclude using gist (
    spot_id with =,
    tstzrange(start_time, end_time, '[)') with &&
  ) where (status in ('pending_payment', 'upcoming', 'active'))
);
create index bookings_user_idx on public.bookings (user_id, start_time desc);
create index bookings_location_time_idx on public.bookings (location_id, start_time, end_time);
create index bookings_status_idx on public.bookings (status);
create unique index bookings_qr_idx on public.bookings (qr_code);

create table public.booking_extensions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  old_end_time timestamptz not null,
  new_end_time timestamptz not null,
  amount numeric(10, 2) not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  stripe_checkout_session_id text,
  stripe_payment_id text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Data used by AI features
-- ---------------------------------------------------------------------------
create table public.occupancy_history (
  id bigint generated always as identity primary key,
  location_id uuid not null references public.parking_locations (id) on delete cascade,
  ts timestamptz not null default now(),
  occupied_count integer not null check (occupied_count >= 0),
  total_spots integer not null check (total_spots > 0),
  -- bookings: derived from ParkSmart bookings on fully managed (host) inventory
  -- cv: counted from a camera image; sample: synthetic seed data (opt-in, flagged)
  source text not null check (source in ('bookings', 'cv', 'sensor', 'sample'))
);
create index occupancy_history_loc_ts_idx on public.occupancy_history (location_id, ts desc);

create table public.ai_detections (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.parking_locations (id) on delete cascade,
  image_url text not null,
  free_count integer not null check (free_count >= 0),
  occupied_count integer not null check (occupied_count >= 0),
  boxes jsonb not null default '[]'::jsonb,
  image_width integer,
  image_height integer,
  model text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index ai_detections_loc_idx on public.ai_detections (location_id, created_at desc);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  venue text,
  geom geography(Point, 4326) not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- 0..1: share of remaining free capacity expected to be absorbed nearby
  impact numeric(3, 2) not null default 0.3 check (impact between 0 and 1),
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index events_geom_idx on public.events using gist (geom);
create index events_time_idx on public.events (starts_at, ends_at);

create table public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  for_date date not null,
  summary jsonb not null,
  model text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index ai_insights_date_idx on public.ai_insights (for_date desc, created_at desc);

-- ---------------------------------------------------------------------------
-- Social
-- ---------------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  location_id uuid not null references public.parking_locations (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,
  author_name text,
  rating integer not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  unique (user_id, booking_id)
);
create index reviews_location_idx on public.reviews (location_id, created_at desc);

create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  location_id uuid not null references public.parking_locations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, location_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'info',
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
