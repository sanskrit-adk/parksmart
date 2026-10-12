-- Row Level Security, storage buckets and Realtime publication.

set search_path = public, extensions;

create index if not exists bookings_spot_idx on public.bookings (spot_id);

alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.parking_locations enable row level security;
alter table public.spots enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_extensions enable row level security;
alter table public.occupancy_history enable row level security;
alter table public.ai_detections enable row level security;
alter table public.events enable row level security;
alter table public.ai_insights enable row level security;
alter table public.reviews enable row level security;
alter table public.favorites enable row level security;
alter table public.notifications enable row level security;

-- Profiles ------------------------------------------------------------------
create policy "profiles: read own or admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles: update own or admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Vehicles ------------------------------------------------------------------
create policy "vehicles: owner all" on public.vehicles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "vehicles: admin read" on public.vehicles
  for select using (public.is_admin());

-- Locations -----------------------------------------------------------------
create policy "locations: public read active" on public.parking_locations
  for select using (is_active or host_id = auth.uid() or public.is_admin());
create policy "locations: hosts create own" on public.parking_locations
  for insert with check (
    (host_id = auth.uid() and source = 'host'
      and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('host', 'admin')))
    or public.is_admin()
  );
create policy "locations: owner or admin update" on public.parking_locations
  for update using (host_id = auth.uid() or public.is_admin())
  with check (host_id = auth.uid() or public.is_admin());
create policy "locations: owner or admin delete" on public.parking_locations
  for delete using (host_id = auth.uid() or public.is_admin());

-- Spots (statuses are maintained by security-definer functions) --------------
create policy "spots: public read" on public.spots for select using (true);

-- Bookings (writes go through create_booking_hold / server routes) -----------
create policy "bookings: driver, host or admin read" on public.bookings
  for select using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.parking_locations l where l.id = location_id and l.host_id = auth.uid())
  );

create policy "booking_extensions: own read" on public.booking_extensions
  for select using (user_id = auth.uid() or public.is_admin());

-- AI data -------------------------------------------------------------------
create policy "occupancy_history: public read" on public.occupancy_history for select using (true);

create policy "ai_detections: owner or admin read" on public.ai_detections
  for select using (
    public.is_admin()
    or exists (select 1 from public.parking_locations l where l.id = location_id and l.host_id = auth.uid())
  );

create policy "events: public read" on public.events for select using (true);
create policy "events: admin write" on public.events
  for all using (public.is_admin()) with check (public.is_admin());

create policy "ai_insights: admin read" on public.ai_insights for select using (public.is_admin());

-- Reviews: anyone reads; only drivers with a finished booking there can post --
create policy "reviews: public read" on public.reviews for select using (true);
create policy "reviews: insert after completed booking" on public.reviews
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.user_id = auth.uid() and b.location_id = reviews.location_id
        and (b.status = 'completed' or (b.status = 'active' and b.checked_in_at is not null))
    )
  );
create policy "reviews: owner update" on public.reviews
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reviews: owner or admin delete" on public.reviews
  for delete using (user_id = auth.uid() or public.is_admin());

-- Favorites / notifications ---------------------------------------------------
create policy "favorites: owner all" on public.favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "notifications: owner read" on public.notifications
  for select using (user_id = auth.uid());
create policy "notifications: owner mark read" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications: owner delete" on public.notifications
  for delete using (user_id = auth.uid());

-- Function privileges -----------------------------------------------------------
revoke execute on function public.tick() from public, anon, authenticated;
revoke execute on function public.refresh_availability(uuid[]) from public, anon, authenticated;
grant execute on function public.nearby_locations to anon, authenticated;
grant execute on function public.locations_in_bounds to anon, authenticated;
grant execute on function public.location_forecast to anon, authenticated;
grant execute on function public.predict_occupancy_rate to anon, authenticated;
grant execute on function public.public_stats to anon, authenticated;
grant execute on function public.create_booking_hold to authenticated;
revoke execute on function public.create_booking_hold from anon;

-- Storage -----------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('location-photos', 'location-photos', true, 8388608, array['image/jpeg', 'image/png', 'image/webp']),
  ('detections', 'detections', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "location photos: public read" on storage.objects
  for select using (bucket_id = 'location-photos');
create policy "location photos: users upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'location-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "location photos: users delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'location-photos' and (storage.foldername(name))[1] = auth.uid()::text);
-- Detection images are written by the server (service role) only.
create policy "detections: public read" on storage.objects
  for select using (bucket_id = 'detections');

-- Realtime ------------------------------------------------------------------------
alter publication supabase_realtime add table public.parking_locations;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.bookings;
