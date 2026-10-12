-- Schedule the availability/booking-lifecycle job with pg_cron (available on all
-- Supabase projects). If you prefer Vercel Cron instead, skip this file and point
-- a cron at GET /api/cron/tick with the CRON_SECRET bearer token.

create extension if not exists pg_cron;

select cron.schedule('parksmart-tick', '* * * * *', $$select public.tick()$$);

-- Keep history bounded: 180 days is plenty for weekday/hour predictions.
select cron.schedule(
  'parksmart-prune-history',
  '17 3 * * *',
  $$delete from public.occupancy_history where ts < now() - interval '180 days'$$
);
