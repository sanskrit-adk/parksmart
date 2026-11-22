-- Demo booking actions for prototypes that run WITHOUT the service-role key.
-- Each function acts only on the caller's own booking (auth.uid()) and is used
-- by the app only when SUPABASE_SERVICE_ROLE_KEY is unset and Stripe is off.
-- Payments are simulated: payment ids start with 'sim_' and no money moves.
--
-- Apply once: Supabase dashboard -> SQL Editor -> paste this file -> Run.

create or replace function public.demo_confirm_booking(p_booking_id uuid)
returns public.bookings
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  b public.bookings;
begin
  select * into b from public.bookings where id = p_booking_id and user_id = auth.uid();
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  if b.status <> 'pending_payment' then return b; end if;
  update public.bookings
     set status = (case when start_time <= now() then 'active' else 'upcoming' end)::public.booking_status,
         stripe_payment_id = 'sim_' || replace(gen_random_uuid()::text, '-', ''),
         hold_expires_at = null,
         cancelled_at = null
   where id = p_booking_id
  returning * into b;
  return b;
end;
$$;

create or replace function public.demo_cancel_booking(p_booking_id uuid, p_refund numeric default 0)
returns public.bookings
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  b public.bookings;
begin
  select * into b from public.bookings where id = p_booking_id and user_id = auth.uid();
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  if b.status not in ('pending_payment', 'upcoming', 'active') then raise exception 'This booking can''t be cancelled'; end if;
  update public.bookings
     set status = 'cancelled', cancelled_at = now(),
         refund_amount = greatest(0, least(coalesce(p_refund, 0), total_price))
   where id = p_booking_id
  returning * into b;
  return b;
end;
$$;

create or replace function public.demo_check_in(p_booking_id uuid)
returns public.bookings
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  b public.bookings;
begin
  select * into b from public.bookings where id = p_booking_id and user_id = auth.uid();
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  if b.status not in ('upcoming', 'active') then raise exception 'This booking can''t be checked in'; end if;
  if b.start_time - now() > interval '30 minutes' then raise exception 'Check-in opens 30 minutes before your start time'; end if;
  if b.end_time <= now() then raise exception 'This booking has ended'; end if;
  update public.bookings
     set status = 'active', checked_in_at = now(),
         start_time = least(start_time, now())
   where id = p_booking_id
  returning * into b;
  return b;
end;
$$;

-- Extends the caller's booking immediately (simulated payment of p_amount).
create or replace function public.demo_extend_booking(p_booking_id uuid, p_new_end timestamptz, p_amount numeric)
returns public.bookings
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  b public.bookings;
  v_added numeric;
begin
  select * into b from public.bookings where id = p_booking_id and user_id = auth.uid();
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  if b.status not in ('upcoming', 'active') then raise exception 'Only upcoming or active bookings can be extended'; end if;
  if p_new_end <= b.end_time or p_new_end - b.start_time > interval '24 hours' then raise exception 'Invalid extension'; end if;
  v_added := extract(epoch from (p_new_end - b.end_time)) / 3600;
  insert into public.booking_extensions (booking_id, user_id, old_end_time, new_end_time, amount, status, stripe_payment_id)
  values (b.id, b.user_id, b.end_time, p_new_end, greatest(0, p_amount), 'paid', 'sim_' || replace(gen_random_uuid()::text, '-', ''));
  update public.bookings
     set end_time = p_new_end,
         ending_notified = false,
         total_price = total_price + greatest(0, p_amount),
         price_breakdown = price_breakdown
           || jsonb_build_object(
                'hours', round(((price_breakdown->>'hours')::numeric + v_added), 2),
                'subtotal', (price_breakdown->>'subtotal')::numeric + greatest(0, p_amount),
                'total', (price_breakdown->>'total')::numeric + greatest(0, p_amount))
   where id = p_booking_id
  returning * into b;
  return b;
end;
$$;

revoke execute on function public.demo_confirm_booking(uuid) from public, anon;
revoke execute on function public.demo_cancel_booking(uuid, numeric) from public, anon;
revoke execute on function public.demo_check_in(uuid) from public, anon;
revoke execute on function public.demo_extend_booking(uuid, timestamptz, numeric) from public, anon;
grant execute on function public.demo_confirm_booking(uuid) to authenticated;
grant execute on function public.demo_cancel_booking(uuid, numeric) to authenticated;
grant execute on function public.demo_check_in(uuid) to authenticated;
grant execute on function public.demo_extend_booking(uuid, timestamptz, numeric) to authenticated;
