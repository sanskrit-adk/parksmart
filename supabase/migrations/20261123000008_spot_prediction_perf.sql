-- Faster per-space offset: compare the space's busy rate with its lot's overall
-- rate (two indexed aggregates) instead of a per-row self-join, which timed out
-- on real data volumes.

create index if not exists spot_occupancy_history_loc_ts_idx on public.spot_occupancy_history (location_id, ts desc);

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

  -- How much busier/quieter this space is than its lot overall (all hours, 56 days).
  select coalesce((sum(h.busy::int) - count(*) * (
           select avg(h2.busy::int)::numeric from public.spot_occupancy_history h2
           where h2.location_id = s.location_id and h2.ts > now() - interval '56 days'
         )) / (count(*) + 10), 0)
    into v_off
  from public.spot_occupancy_history h
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

