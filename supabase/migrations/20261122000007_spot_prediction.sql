-- Per-space (slot) availability prediction.
--
-- spot_occupancy_history: one row per space per hour (busy = reserved/occupied).
--   Filled by snapshot_spot_occupancy() (pg_cron hourly, below) and, opt-in,
--   by `npm run seed -- --spot-history` with source='sample'.
-- spot_free_probability(): chance a given space is free at a time.
--   base  = location forecast + this space's (shrunk) busyness offset vs its lot
--   rate  = this space's weekday/hour history, shrunk towards base (k=10)
--   Tuned with `npm run ml:train -- --per-spot`. Then overrides with certain
--   facts: a booking on that space, or its live status in the next 30 minutes.

create table public.spot_occupancy_history (
  id bigint generated always as identity primary key,
  spot_id uuid not null references public.spots (id) on delete cascade,
  location_id uuid not null references public.parking_locations (id) on delete cascade,
  ts timestamptz not null,
  busy boolean not null,
  source text not null check (source in ('bookings', 'cv', 'sensor', 'sample'))
);
create index spot_occupancy_history_spot_ts_idx on public.spot_occupancy_history (spot_id, ts desc);
create unique index spot_occupancy_history_spot_hour_idx on public.spot_occupancy_history (spot_id, ts);

alter table public.spot_occupancy_history enable row level security;
create policy "spot history: public read" on public.spot_occupancy_history for select using (true);

-- Hourly snapshot of every space's status. Idempotent within an hour.
create or replace function public.snapshot_spot_occupancy()
returns int
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_n int;
begin
  insert into public.spot_occupancy_history (spot_id, location_id, ts, busy, source)
  select s.id, s.location_id, date_trunc('hour', now()), s.status <> 'free', 'bookings'
  from public.spots s
  on conflict (spot_id, ts) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Core: probability the space is free at p_at, given the location's predicted
-- occupancy rate (passed in so a whole-lot query computes it once).
create or replace function public.spot_free_probability_with(p_spot_id uuid, p_at timestamptz, p_loc_rate numeric)
returns table (free_probability numeric, history_n int, basis text)
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare
  s public.spots;
  v_tz text;
  v_dow int;
  v_hour int;
  v_hist numeric;
  v_n int;
  v_busy numeric;
  v_base numeric;
  v_off numeric;
  v_booked boolean;
  k constant numeric := 10;  -- bucket prior strength, in observations
begin
  select * into s from public.spots where id = p_spot_id;
  if not found then return; end if;
  select l.timezone into v_tz from public.parking_locations l where l.id = s.location_id;

  -- A booking on this exact space makes it (almost) certainly taken.
  select exists (
    select 1 from public.bookings b
    where b.spot_id = p_spot_id
      and b.status in ('pending_payment', 'upcoming', 'active')
      and b.start_time <= p_at and b.end_time > p_at
  ) into v_booked;
  if v_booked then
    return query select 0.02::numeric, 0, 'booked'::text;
    return;
  end if;

  v_dow := extract(isodow from p_at at time zone v_tz)::int;
  v_hour := extract(hour from p_at at time zone v_tz)::int;
  select avg(h.busy::int)::numeric, count(*)::int into v_hist, v_n
  from public.spot_occupancy_history h
  where h.spot_id = p_spot_id
    and h.ts > now() - interval '56 days'
    and extract(isodow from h.ts at time zone v_tz) = v_dow
    and extract(hour from h.ts at time zone v_tz) = v_hour;

  -- How much busier/quieter this space is than its lot overall (all hours).
  select coalesce(sum(h.busy::int - l.rate) / (count(*) + 10), 0) into v_off
  from public.spot_occupancy_history h,
       lateral (select avg(h2.busy::int)::numeric as rate
                from public.spot_occupancy_history h2
                where h2.location_id = h.location_id and h2.ts = h.ts) l
  where h.spot_id = p_spot_id and h.ts > now() - interval '56 days';
  v_base := least(0.98, greatest(0.02, coalesce(p_loc_rate, 0.5) + v_off));

  -- Shrink the space's own weekday/hour rate towards that base.
  v_busy := case when v_n > 0 then (v_hist * v_n + v_base * k) / (v_n + k) else v_base end;

  -- Live status dominates the next 30 minutes.
  if abs(extract(epoch from p_at - now())) < 1800 then
    v_busy := 0.7 * (s.status <> 'free')::int + 0.3 * v_busy;
    return query select round(least(0.98, greatest(0.02, 1 - v_busy)), 3), v_n, 'live'::text;
    return;
  end if;

  return query select round(least(0.98, greatest(0.02, 1 - v_busy)), 3), v_n,
    (case when v_n > 0 then 'history' else 'location' end)::text;
end $$;

create or replace function public.spot_free_probability(p_spot_id uuid, p_at timestamptz default now())
returns numeric
language sql stable security definer
set search_path = public, extensions
as $$
  select f.free_probability
  from public.spots s,
       lateral public.spot_free_probability_with(s.id, p_at, public.predict_occupancy_rate(s.location_id, p_at)) f
  where s.id = p_spot_id;
$$;

-- Hourly forecast for one space.
create or replace function public.spot_forecast(p_spot_id uuid, p_from timestamptz default now(), p_hours int default 24)
returns table (ts timestamptz, free_probability numeric, basis text)
language sql stable security definer
set search_path = public, extensions
as $$
  select t, f.free_probability, f.basis
  from public.spots s,
       generate_series(date_trunc('hour', p_from), date_trunc('hour', p_from) + make_interval(hours => least(p_hours, 168) - 1), interval '1 hour') t,
       lateral public.spot_free_probability_with(s.id, t, public.predict_occupancy_rate(s.location_id, t)) f
  where s.id = p_spot_id;
$$;

-- Every space at a location at one time (for the slot grid).
create or replace function public.location_spot_predictions(p_location_id uuid, p_at timestamptz default now())
returns table (spot_id uuid, label text, status public.spot_status, free_probability numeric, history_n int, basis text, is_sample boolean)
language sql stable security definer
set search_path = public, extensions
as $$
  with r as (select public.predict_occupancy_rate(p_location_id, p_at) as rate)
  select s.id, s.label, s.status, f.free_probability, f.history_n, f.basis,
         exists (select 1 from public.spot_occupancy_history h where h.spot_id = s.id and h.source = 'sample')
  from public.spots s cross join r,
       lateral public.spot_free_probability_with(s.id, p_at, r.rate) f
  where s.location_id = p_location_id
  order by length(s.label), s.label
  limit 200;
$$;

revoke execute on function public.snapshot_spot_occupancy() from public, anon, authenticated;
revoke execute on function public.spot_free_probability_with(uuid, timestamptz, numeric) from public, anon, authenticated;
grant execute on function public.spot_free_probability(uuid, timestamptz) to anon, authenticated;
grant execute on function public.spot_forecast(uuid, timestamptz, int) to anon, authenticated;
grant execute on function public.location_spot_predictions(uuid, timestamptz) to anon, authenticated;

-- Schedule snapshots + pruning when pg_cron is installed (skipped elsewhere).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('parksmart-spot-snapshot', '0 * * * *', 'select public.snapshot_spot_occupancy()');
    perform cron.schedule('parksmart-prune-spot-history', '23 3 * * *',
      $q$delete from public.spot_occupancy_history where ts < now() - interval '180 days'$q$);
  end if;
end $$;
