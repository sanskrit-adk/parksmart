-- ParkSmart functions: availability model, predictions, geo search, booking holds, triggers.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- True for the service-role key, or for direct database sessions (SQL editor,
-- pg_cron, seed scripts) which carry no JWT at all. API requests from browsers
-- always carry an anon/authenticated JWT. Do NOT test current_user here: inside
-- security-definer functions it is always the function owner.
create or replace function public.is_service_role()
returns boolean
language sql stable
as $$
  select coalesce(auth.jwt() ->> 'role', 'service_role') = 'service_role';
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger locations_touch before update on public.parking_locations for each row
  execute function public.touch_updated_at();
create trigger bookings_touch before update on public.bookings for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Profiles: auto-create on sign-up, block role escalation
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.guard_profile_role()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and not public.is_service_role()
     and not public.is_admin()
     -- A driver may opt in to hosting themselves; nothing else is self-service.
     and not (old.role = 'driver' and new.role = 'host' and auth.uid() = old.id) then
    raise exception 'Not allowed to change role' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger profiles_guard_role before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ---------------------------------------------------------------------------
-- Opening hours
-- ---------------------------------------------------------------------------
-- Returns null when hours are not listed (unknown), otherwise whether open at p_at.
create or replace function public.is_open_at(p_hours jsonb, p_tz text, p_at timestamptz)
returns boolean
language plpgsql immutable
as $$
declare
  local_ts timestamp := p_at at time zone coalesce(p_tz, 'America/Los_Angeles');
  day_key text := (array['mon','tue','wed','thu','fri','sat','sun'])[extract(isodow from local_ts)::int];
  t time := local_ts::time;
  r jsonb;
begin
  if p_hours is null then
    return null;
  end if;
  if coalesce((p_hours ->> 'always')::boolean, false) then
    return true;
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_hours -> day_key, '[]'::jsonb)) loop
    if (r ->> 1) <= (r ->> 0) then
      -- overnight range, e.g. 18:00-02:00, or 00:00-00:00 meaning all day
      if t >= (r ->> 0)::time or t < (r ->> 1)::time or (r ->> 0) = (r ->> 1) then
        return true;
      end if;
    elsif t >= (r ->> 0)::time and t < (r ->> 1)::time then
      return true;
    end if;
  end loop;
  return false;
end $$;

-- ---------------------------------------------------------------------------
-- Occupancy prior: typical share of capacity in use, by type / weekday / hour.
-- Shaped after published SF garage & meter utilisation patterns; real history
-- (occupancy_history) progressively overrides it.
-- ---------------------------------------------------------------------------
create or replace function public.prior_occupancy(p_type public.location_type, p_isodow int, p_hour int)
returns numeric
language sql immutable
as $$
  select (case
    when p_type = 'garage' and p_isodow <= 5 then
      array[.15,.12,.10,.10,.10,.12,.20,.35,.60,.78,.85,.88,.88,.87,.85,.80,.70,.55,.50,.50,.45,.35,.25,.18]
    when p_type = 'garage' then
      array[.25,.20,.15,.12,.10,.10,.12,.18,.25,.35,.50,.62,.70,.72,.72,.70,.65,.60,.62,.65,.60,.50,.40,.30]
    when p_type = 'lot' and p_isodow <= 5 then
      array[.10,.08,.07,.07,.07,.10,.18,.30,.50,.65,.72,.75,.78,.75,.72,.68,.60,.50,.45,.42,.38,.30,.20,.14]
    when p_type = 'lot' then
      array[.15,.10,.08,.07,.07,.08,.10,.15,.25,.40,.55,.65,.70,.70,.68,.65,.60,.55,.50,.45,.40,.32,.25,.20]
    when p_type = 'street' and p_isodow <= 5 then
      array[.55,.50,.50,.50,.50,.50,.55,.65,.78,.85,.88,.90,.92,.90,.88,.87,.86,.88,.90,.88,.82,.75,.68,.60]
    when p_type = 'street' then
      array[.60,.55,.52,.50,.50,.50,.52,.58,.66,.75,.82,.87,.90,.90,.90,.88,.86,.87,.88,.86,.80,.74,.68,.64]
    when p_isodow <= 5 then
      array[.10,.10,.10,.10,.10,.10,.12,.18,.25,.30,.30,.30,.30,.30,.30,.30,.28,.25,.22,.18,.15,.12,.10,.10]
    else
      array[.12,.12,.12,.12,.12,.12,.12,.12,.15,.20,.25,.28,.28,.28,.28,.26,.24,.22,.20,.18,.16,.14,.13,.12]
  end)[p_hour + 1]::numeric;
$$;

-- Probability that at least one space is free, given a predicted occupancy rate.
-- Accounts for model uncertainty (±8% of capacity) on top of binomial noise.
create or replace function public.free_probability(p_rate numeric, p_total int)
returns numeric
language sql immutable
as $$
  select round(
    (1 / (1 + exp(
      -1.7 * ((p_total * (1 - p_rate)) - 0.5)
      / greatest(0.75, p_total * 0.08 + sqrt(greatest(p_total * p_rate * (1 - p_rate), 0)))
    )))::numeric, 3);
$$;

-- ---------------------------------------------------------------------------
-- Prediction: occupancy rate for a location at a given time.
-- Blends: type/time prior + observed history (same weekday & hour, 8 weeks)
--         + ParkSmart bookings at that time + nearby events + fresh CV counts.
-- ---------------------------------------------------------------------------
create or replace function public.predict_occupancy_rate(p_location_id uuid, p_at timestamptz)
returns numeric
-- security definer: must count every driver's bookings, but only returns an aggregate.
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare
  loc public.parking_locations;
  local_ts timestamp;
  v_dow int;
  v_hour int;
  v_prior numeric;
  v_hist numeric;
  v_n int;
  v_booked int;
  v_event numeric;
  v_rate numeric;
  v_det public.ai_detections;
begin
  select * into loc from public.parking_locations where id = p_location_id;
  if not found then
    return null;
  end if;

  local_ts := p_at at time zone loc.timezone;
  v_dow := extract(isodow from local_ts)::int;
  v_hour := extract(hour from local_ts)::int;
  v_prior := public.prior_occupancy(loc.type, v_dow, v_hour);

  select avg(least(1, h.occupied_count::numeric / h.total_spots)), count(*)
    into v_hist, v_n
  from public.occupancy_history h
  where h.location_id = p_location_id
    and h.ts > now() - interval '56 days'
    and extract(isodow from h.ts at time zone loc.timezone) = v_dow
    and extract(hour from h.ts at time zone loc.timezone) = v_hour;

  v_rate := case when v_n > 0 then (v_hist * v_n + v_prior * 3) / (v_n + 3) else v_prior end;

  select count(*) into v_booked
  from public.bookings b
  where b.location_id = p_location_id
    and b.status in ('pending_payment', 'upcoming', 'active')
    and b.start_time <= p_at and b.end_time > p_at;

  if loc.source = 'host' then
    -- Host inventory is only ever used through ParkSmart: confirmed bookings are
    -- certain, the blended rate is the chance someone else books first.
    v_rate := greatest(v_booked::numeric / loc.total_spots,
                       v_booked::numeric / loc.total_spots + (1 - v_booked::numeric / loc.total_spots) * v_rate * 0.6);
  else
    v_rate := v_rate + v_booked::numeric / loc.total_spots;
  end if;

  select coalesce(max(e.impact), 0) into v_event
  from public.events e
  where st_dwithin(e.geom, loc.geom, 1500)
    and p_at between e.starts_at - interval '2 hours' and e.ends_at + interval '1 hour';
  v_rate := v_rate + v_event * (1 - v_rate);

  -- A camera count from the last 30 minutes dominates near-term predictions.
  select * into v_det from public.ai_detections d
  where d.location_id = p_location_id and d.created_at > now() - interval '30 minutes'
  order by d.created_at desc limit 1;
  if found and (v_det.free_count + v_det.occupied_count) > 0 and abs(extract(epoch from p_at - now())) < 3600 then
    v_rate := 0.75 * (v_det.occupied_count::numeric / (v_det.free_count + v_det.occupied_count)) + 0.25 * v_rate;
  end if;

  return round(least(0.99, greatest(0.02, v_rate)), 3);
end $$;

-- 24-hour forecast, hourly buckets starting at the top of the hour.
create or replace function public.location_forecast(p_location_id uuid, p_from timestamptz default now(), p_hours int default 24)
returns table (ts timestamptz, occupancy_rate numeric, free_probability numeric)
language sql stable
set search_path = public, extensions
as $$
  select t,
         public.predict_occupancy_rate(p_location_id, t),
         public.free_probability(public.predict_occupancy_rate(p_location_id, t), l.total_spots)
  from public.parking_locations l,
       generate_series(date_trunc('hour', p_from), date_trunc('hour', p_from) + make_interval(hours => p_hours - 1), interval '1 hour') t
  where l.id = p_location_id;
$$;

-- ---------------------------------------------------------------------------
-- Live availability. Recomputes spot statuses from bookings and the
-- per-location headline numbers that Realtime pushes to every map.
--   live      = host-managed inventory, or a camera count < 30 min old
--   estimated = everything else (time-of-day model + ParkSmart bookings)
-- ---------------------------------------------------------------------------
create or replace function public.refresh_availability(p_location_ids uuid[] default null)
returns integer
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_count integer;
begin
  -- Only spots that are currently busy, or have a booking around now, can change.
  with live_b as (
    select b.spot_id,
           bool_or(b.status = 'active' and b.checked_in_at is not null and b.start_time <= now()) as occupied
    from public.bookings b
    where b.status in ('pending_payment', 'upcoming', 'active')
      and b.start_time <= now() + interval '15 minutes' and b.end_time > now()
      and (p_location_ids is null or b.location_id = any (p_location_ids))
    group by b.spot_id
  ),
  target as (
    select s2.id,
           (case when lb.occupied then 'occupied' when lb.spot_id is not null then 'reserved' else 'free' end)::public.spot_status as new_status
    from public.spots s2
    left join live_b lb on lb.spot_id = s2.id
    where (p_location_ids is null or s2.location_id = any (p_location_ids))
      and (s2.status <> 'free' or lb.spot_id is not null)
  )
  update public.spots s
  set status = t.new_status, updated_at = now()
  from target t
  where s.id = t.id and s.status is distinct from t.new_status;

  with det as (
    select distinct on (d.location_id) d.location_id, d.free_count, d.occupied_count
    from public.ai_detections d
    where d.created_at > now() - interval '30 minutes'
      and (p_location_ids is null or d.location_id = any (p_location_ids))
    order by d.location_id, d.created_at desc
  ),
  sp as (
    select s.location_id,
           count(*) filter (where s.status = 'free') as free_spots,
           count(*) filter (where s.status <> 'free') as busy_spots
    from public.spots s
    where p_location_ids is null or s.location_id = any (p_location_ids)
    group by s.location_id
  ),
  calc as (
    select l.id,
      case when l.source = 'host' or det.location_id is not null then 'live' else 'estimated' end as mode,
      case
        when det.location_id is not null then
          greatest(0, det.free_count - coalesce(sp.busy_spots, 0))
        when l.source = 'host' then
          coalesce(sp.free_spots, 0)
        else
          greatest(0, round(l.total_spots * (1 - public.prior_occupancy(
            l.type,
            extract(isodow from now() at time zone l.timezone)::int,
            extract(hour from now() at time zone l.timezone)::int))) - coalesce(sp.busy_spots, 0))::int
      end as free_now,
      l.total_spots
    from public.parking_locations l
    left join det on det.location_id = l.id
    left join sp on sp.location_id = l.id
    where (p_location_ids is null or l.id = any (p_location_ids))
  )
  update public.parking_locations l
  set available_now = c.free_now,
      availability_mode = c.mode,
      occupancy_rate = round(1 - c.free_now::numeric / c.total_spots, 3),
      availability_updated_at = now()
  from calc c
  where l.id = c.id
    and (l.available_now is distinct from c.free_now or l.availability_mode is distinct from c.mode);

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- Geo search (PostGIS). Returns locations within a radius, with predictions
-- for the requested arrival time. Ranking/explanations happen in the app.
-- ---------------------------------------------------------------------------
create or replace function public.nearby_locations(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 2000,
  p_arrive_at timestamptz default now(),
  p_max_price numeric default null,
  p_covered boolean default null,
  p_ev boolean default null,
  p_accessible boolean default null,
  p_open_now boolean default false,
  p_types public.location_type[] default null,
  p_limit integer default 60
)
returns table (
  id uuid,
  name text,
  address text,
  type public.location_type,
  covered boolean,
  ev_charging boolean,
  accessible boolean,
  total_spots integer,
  capacity_estimated boolean,
  hourly_price numeric,
  price_estimated boolean,
  photos text[],
  rating numeric,
  review_count integer,
  source public.location_source,
  opening_hours jsonb,
  is_open boolean,
  available_now integer,
  availability_mode text,
  lat double precision,
  lng double precision,
  distance_m double precision,
  predicted_rate numeric,
  free_probability numeric
)
language sql stable
set search_path = public, extensions
as $$
  with origin as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g
  ),
  candidates as (
    select l.*, st_distance(l.geom, o.g) as dist
    from public.parking_locations l, origin o
    where l.is_active
      and st_dwithin(l.geom, o.g, least(greatest(p_radius_m, 100), 50000))
      and (p_max_price is null or l.hourly_price <= p_max_price)
      and (p_covered is not true or l.covered)
      and (p_ev is not true or l.ev_charging)
      and (p_accessible is not true or l.accessible)
      and (p_types is null or l.type = any (p_types))
      and not ((p_arrive_at at time zone l.timezone)::date = any (l.blackout_dates))
      -- "Open now" excludes places known to be closed; unknown hours are kept and labelled in the UI.
      and (p_open_now is not true or coalesce(public.is_open_at(l.opening_hours, l.timezone, p_arrive_at), true))
    order by dist
    limit least(greatest(p_limit, 1), 200)
  )
  select c.id, c.name, c.address, c.type, c.covered, c.ev_charging, c.accessible,
         c.total_spots, c.capacity_estimated, c.hourly_price, c.price_estimated, c.photos,
         c.rating, c.review_count, c.source, c.opening_hours,
         public.is_open_at(c.opening_hours, c.timezone, p_arrive_at),
         c.available_now, c.availability_mode,
         st_y(c.geom::geometry), st_x(c.geom::geometry), c.dist,
         pr.rate,
         case
           -- Arriving now at a live location: we know the real count.
           when c.availability_mode = 'live' and p_arrive_at < now() + interval '20 minutes' then
             case when c.available_now >= 2 then 0.95 when c.available_now = 1 then 0.8 else 0.08 end
           else public.free_probability(pr.rate, c.total_spots)
         end
  from candidates c
  cross join lateral (select public.predict_occupancy_rate(c.id, p_arrive_at) as rate) pr
  order by c.dist;
$$;

-- Lightweight viewport query for the map (no per-row predictions).
create or replace function public.locations_in_bounds(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_max_price numeric default null,
  p_covered boolean default null,
  p_ev boolean default null,
  p_accessible boolean default null,
  p_limit integer default 1500
)
returns table (
  id uuid,
  name text,
  type public.location_type,
  hourly_price numeric,
  price_estimated boolean,
  total_spots integer,
  available_now integer,
  availability_mode text,
  lat double precision,
  lng double precision
)
language sql stable
set search_path = public, extensions
as $$
  select l.id, l.name, l.type, l.hourly_price, l.price_estimated, l.total_spots,
         l.available_now, l.availability_mode, st_y(l.geom::geometry), st_x(l.geom::geometry)
  from public.parking_locations l
  where l.is_active
    and l.geom && st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)::geography
    and (p_max_price is null or l.hourly_price <= p_max_price)
    and (p_covered is not true or l.covered)
    and (p_ev is not true or l.ev_charging)
    and (p_accessible is not true or l.accessible)
  limit least(greatest(p_limit, 1), 5000);
$$;

-- ---------------------------------------------------------------------------
-- Spot inventory maintenance
-- ---------------------------------------------------------------------------
create or replace function public.sync_spots()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_target int := case when new.source = 'host' then least(new.total_spots, 500) else least(new.total_spots, 20) end;
  v_prefix text := case new.type when 'street' then 'M' when 'garage' then 'G' when 'lot' then 'L' else 'P' end;
  v_existing int;
begin
  select count(*) into v_existing from public.spots where location_id = new.id;
  if v_existing < v_target then
    insert into public.spots (location_id, label)
    select new.id, v_prefix || n from generate_series(v_existing + 1, v_target) n
    on conflict (location_id, label) do nothing;
  elsif v_existing > v_target then
    -- Remove surplus spots that have no current or future bookings.
    delete from public.spots s
    where s.location_id = new.id
      and s.id in (
        select s2.id from public.spots s2
        where s2.location_id = new.id
          and not exists (select 1 from public.bookings b where b.spot_id = s2.id)
        order by length(s2.label) desc, s2.label desc
        limit v_existing - v_target
      );
  end if;
  perform public.refresh_availability(array[new.id]);
  return null;
end $$;

create trigger parking_locations_sync_spots
  after insert or update of total_spots, source, type on public.parking_locations
  for each row execute function public.sync_spots();

-- ---------------------------------------------------------------------------
-- Booking hold: picks a free spot, prices it server-side, reserves it for
-- 32 minutes while the driver pays (Stripe Checkout sessions last >= 30 min). The exclusion constraint guarantees no
-- double booking even under concurrent requests.
-- ---------------------------------------------------------------------------
create or replace function public.price_breakdown(p_hourly numeric, p_start timestamptz, p_end timestamptz)
returns jsonb
language plpgsql immutable
as $$
declare
  v_hours numeric := round(extract(epoch from (p_end - p_start)) / 3600.0, 2);
  v_sub numeric := round(p_hourly * v_hours, 2);
  v_fee numeric := case when v_sub = 0 then 0 else greatest(0.50, round(v_sub * 0.05, 2)) end;
begin
  return jsonb_build_object(
    'hours', v_hours,
    'hourly_price', p_hourly,
    'subtotal', v_sub,
    'service_fee', v_fee,
    'total', v_sub + v_fee
  );
end $$;

create or replace function public.create_booking_hold(
  p_location_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_vehicle_plate text default null
)
returns public.bookings
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  loc public.parking_locations;
  v_spot uuid;
  v_breakdown jsonb;
  v_booking public.bookings;
  v_attempt int := 0;
begin
  if v_uid is null then
    raise exception 'You need to sign in to book' using errcode = '28000';
  end if;
  if p_start < now() - interval '10 minutes' then
    raise exception 'Start time is in the past' using errcode = '22023';
  end if;
  if p_end <= p_start then
    raise exception 'End time must be after start time' using errcode = '22023';
  end if;
  if p_end - p_start < interval '30 minutes' then
    raise exception 'Minimum booking is 30 minutes' using errcode = '22023';
  end if;
  if p_end - p_start > interval '24 hours' then
    raise exception 'Maximum booking is 24 hours' using errcode = '22023';
  end if;
  if p_start > now() + interval '60 days' then
    raise exception 'Bookings open up to 60 days ahead' using errcode = '22023';
  end if;

  select * into loc from public.parking_locations where id = p_location_id and is_active;
  if not found then
    raise exception 'This location is not available' using errcode = 'P0002';
  end if;
  if (p_start at time zone loc.timezone)::date = any (loc.blackout_dates) then
    raise exception 'The host has blocked this date' using errcode = '22023';
  end if;
  if public.is_open_at(loc.opening_hours, loc.timezone, p_start) is false then
    raise exception 'This location is closed at your start time' using errcode = '22023';
  end if;

  -- Release this user's own stale holds so a retry never blocks itself.
  update public.bookings set status = 'cancelled', cancelled_at = now()
  where user_id = v_uid and status = 'pending_payment' and hold_expires_at < now();

  v_breakdown := public.price_breakdown(loc.hourly_price, p_start, p_end);

  loop
    v_attempt := v_attempt + 1;
    select s.id into v_spot
    from public.spots s
    where s.location_id = p_location_id
      and not exists (
        select 1 from public.bookings b
        where b.spot_id = s.id
          and b.status in ('pending_payment', 'upcoming', 'active')
          and tstzrange(b.start_time, b.end_time, '[)') && tstzrange(p_start, p_end, '[)')
      )
    order by length(s.label), s.label
    limit 1
    for update skip locked;

    if v_spot is null then
      raise exception 'No bookable spaces left here for that time' using errcode = 'P0001';
    end if;

    begin
      insert into public.bookings (user_id, spot_id, location_id, start_time, end_time, status,
                                   total_price, price_breakdown, vehicle_plate, hold_expires_at)
      values (v_uid, v_spot, p_location_id, p_start, p_end,
              (case when (v_breakdown ->> 'total')::numeric = 0 then 'upcoming' else 'pending_payment' end)::public.booking_status,
              (v_breakdown ->> 'total')::numeric, v_breakdown,
              nullif(upper(regexp_replace(coalesce(p_vehicle_plate, ''), '[^A-Za-z0-9]', '', 'g')), ''),
              now() + interval '32 minutes')
      returning * into v_booking;
      return v_booking;
    exception when exclusion_violation then
      if v_attempt >= 3 then
        raise exception 'That time was just taken, please try again' using errcode = 'P0001';
      end if;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Reviews keep the location rating in sync
-- ---------------------------------------------------------------------------
create or replace function public.sync_location_rating()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_loc uuid := coalesce(new.location_id, old.location_id);
begin
  update public.parking_locations l
  set rating = r.avg_rating, review_count = r.cnt
  from (select round(avg(rating)::numeric, 1) as avg_rating, count(*)::int as cnt
        from public.reviews where location_id = v_loc) r
  where l.id = v_loc;
  return null;
end $$;

create trigger reviews_sync_rating after insert or update or delete on public.reviews
  for each row execute function public.sync_location_rating();

create or replace function public.set_review_author()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  select coalesce(split_part(name, ' ', 1), 'Driver') into new.author_name from public.profiles where id = new.user_id;
  return new;
end $$;

create trigger reviews_set_author before insert on public.reviews
  for each row execute function public.set_review_author();

-- ---------------------------------------------------------------------------
-- Booking side effects: availability refresh + notifications
-- ---------------------------------------------------------------------------
create or replace function public.on_booking_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_name text;
begin
  perform public.refresh_availability(array[coalesce(new.location_id, old.location_id)]);

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    select name into v_name from public.parking_locations where id = new.location_id;
    if new.status = 'upcoming' and old.status = 'pending_payment' then
      insert into public.notifications (user_id, kind, title, body, link)
      values (new.user_id, 'booking', 'Booking confirmed', 'Your space at ' || v_name || ' is reserved.', '/bookings/' || new.id);
    elsif new.status = 'active' then
      insert into public.notifications (user_id, kind, title, body, link)
      values (new.user_id, 'booking', 'Your booking has started', v_name || ' — drive safe.', '/bookings/' || new.id);
    elsif new.status = 'cancelled' and old.status <> 'pending_payment' then
      insert into public.notifications (user_id, kind, title, body, link)
      values (new.user_id, 'booking', 'Booking cancelled',
              case when coalesce(new.refund_amount, 0) > 0
                   then 'Refund of $' || to_char(new.refund_amount, 'FM999990.00') || ' is on its way.'
                   else 'No refund applies to this cancellation.' end,
              '/bookings/' || new.id);
    elsif new.status = 'completed' then
      insert into public.notifications (user_id, kind, title, body, link)
      values (new.user_id, 'review', 'How was ' || v_name || '?', 'Rate your parking to help other drivers.', '/bookings?tab=past');
    end if;
  elsif tg_op = 'INSERT' and new.status = 'upcoming' then
    select name into v_name from public.parking_locations where id = new.location_id;
    insert into public.notifications (user_id, kind, title, body, link)
    values (new.user_id, 'booking', 'Booking confirmed', 'Your space at ' || v_name || ' is reserved.', '/bookings/' || new.id);
  end if;
  return null;
end $$;

create trigger bookings_after_change after insert or update or delete on public.bookings
  for each row execute function public.on_booking_change();

-- Camera detections feed both live availability and the prediction history.
create or replace function public.on_detection_insert()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.occupancy_history (location_id, ts, occupied_count, total_spots, source)
  values (new.location_id, new.created_at, new.occupied_count,
          greatest(new.free_count + new.occupied_count, 1), 'cv');
  perform public.refresh_availability(array[new.location_id]);
  return null;
end $$;

create trigger ai_detections_after_insert after insert on public.ai_detections
  for each row execute function public.on_detection_insert();

-- ---------------------------------------------------------------------------
-- Periodic job (pg_cron every minute, or /api/cron/tick)
-- ---------------------------------------------------------------------------
create or replace function public.tick()
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_expired int;
  v_started int;
  v_completed int;
  v_refreshed int;
  v_snap int := 0;
begin
  update public.bookings set status = 'cancelled', cancelled_at = now()
  where status = 'pending_payment' and hold_expires_at < now();
  get diagnostics v_expired = row_count;

  update public.bookings set status = 'active'
  where status = 'upcoming' and start_time <= now() and end_time > now();
  get diagnostics v_started = row_count;

  update public.bookings set status = 'completed'
  where status in ('upcoming', 'active') and end_time <= now();
  get diagnostics v_completed = row_count;

  with ending as (
    update public.bookings set ending_notified = true
    where status = 'active' and not ending_notified and end_time <= now() + interval '15 minutes'
    returning id, user_id, end_time
  )
  insert into public.notifications (user_id, kind, title, body, link)
  select user_id, 'reminder', 'Booking ends soon', 'Your time is up in about 15 minutes. Extend from the app if you need longer.', '/bookings/' || id
  from ending;

  v_refreshed := public.refresh_availability(null);

  -- Hourly snapshot of fully observed (live) locations for future predictions.
  if extract(minute from now()) < 1 or not exists (
    select 1 from public.occupancy_history where source = 'bookings' and ts > now() - interval '55 minutes'
  ) then
    insert into public.occupancy_history (location_id, ts, occupied_count, total_spots, source)
    select l.id, date_trunc('minute', now()), greatest(0, l.total_spots - coalesce(l.available_now, l.total_spots)), l.total_spots, 'bookings'
    from public.parking_locations l
    where l.source = 'host' and l.is_active;
    get diagnostics v_snap = row_count;
  end if;

  return jsonb_build_object('expired', v_expired, 'started', v_started, 'completed', v_completed,
                            'refreshed', v_refreshed, 'snapshots', v_snap);
end $$;

-- ---------------------------------------------------------------------------
-- Dashboards
-- ---------------------------------------------------------------------------
create or replace function public.public_stats()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'locations', (select count(*) from public.parking_locations where is_active),
    'spaces_free_now', (select coalesce(sum(available_now), 0) from public.parking_locations where is_active),
    'live_locations', (select count(*) from public.parking_locations where is_active and availability_mode = 'live'),
    'bookings_today', (select count(*) from public.bookings
                       where status <> 'cancelled' and created_at >= date_trunc('day', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles')
  );
$$;

-- Aggregates used by the admin dashboard and the AI insights generator.
create or replace function public.admin_daily_metrics(p_day date default (now() at time zone 'America/Los_Angeles')::date)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_from timestamptz := p_day::timestamp at time zone 'America/Los_Angeles';
  v_to timestamptz := v_from + interval '1 day';
begin
  if not public.is_admin() and not public.is_service_role() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'day', p_day,
    'bookings', (select count(*) from public.bookings where created_at >= v_from and created_at < v_to
                 and status <> 'pending_payment' and not (status = 'cancelled' and stripe_payment_id is null and total_price > 0)),
    'cancelled', (select count(*) from public.bookings where cancelled_at >= v_from and cancelled_at < v_to),
    'revenue', (select coalesce(sum(total_price - coalesce(refund_amount, 0)), 0) from public.bookings
                where created_at >= v_from and created_at < v_to and status in ('upcoming', 'active', 'completed', 'cancelled')
                  and stripe_payment_id is not null),
    'no_shows', (select count(*) from public.bookings
                 where end_time >= v_from and end_time < v_to and status = 'completed' and checked_in_at is null),
    'abandoned_checkouts', (select count(*) from public.bookings
                            where created_at >= v_from and created_at < v_to and status = 'cancelled' and stripe_payment_id is null),
    'bookings_by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'count', c) order by h), '[]'::jsonb) from (
        select extract(hour from start_time at time zone 'America/Los_Angeles')::int h, count(*) c
        from public.bookings where start_time >= v_from and start_time < v_to and status <> 'cancelled' group by 1) x),
    'busiest_locations', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select l.id, l.name, count(*) as bookings, sum(b.total_price) as revenue
        from public.bookings b join public.parking_locations l on l.id = b.location_id
        where b.start_time >= v_from and b.start_time < v_to and b.status <> 'cancelled'
        group by l.id, l.name order by count(*) desc limit 5) x),
    'revenue_trend', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'revenue', r) order by d), '[]'::jsonb) from (
        select (created_at at time zone 'America/Los_Angeles')::date d,
               sum(total_price - coalesce(refund_amount, 0)) r
        from public.bookings
        where created_at >= v_from - interval '13 days' and created_at < v_to and stripe_payment_id is not null
        group by 1) x),
    'occupancy_by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'rate', r) order by h), '[]'::jsonb) from (
        select extract(hour from ts at time zone 'America/Los_Angeles')::int h,
               round(avg(occupied_count::numeric / total_spots), 3) r
        from public.occupancy_history where ts >= v_from - interval '6 days' and ts < v_to group by 1) x),
    'cv_detections', (select count(*) from public.ai_detections where created_at >= v_from and created_at < v_to),
    'new_users', (select count(*) from public.profiles where created_at >= v_from and created_at < v_to)
  );
end $$;

create or replace function public.host_earnings(p_days int default 30)
returns table (day date, revenue numeric, bookings bigint)
language sql stable security definer
set search_path = public
as $$
  select d::date,
         coalesce(sum(b.total_price - coalesce((b.price_breakdown ->> 'service_fee')::numeric, 0) - coalesce(b.refund_amount, 0)), 0),
         count(b.id)
  from generate_series((now() at time zone 'America/Los_Angeles')::date - (p_days - 1),
                       (now() at time zone 'America/Los_Angeles')::date, interval '1 day') d
  left join public.bookings b
    on (b.start_time at time zone 'America/Los_Angeles')::date = d::date
   and b.status in ('upcoming', 'active', 'completed')
   and b.location_id in (select id from public.parking_locations where host_id = auth.uid())
  group by d
  order by d;
$$;
