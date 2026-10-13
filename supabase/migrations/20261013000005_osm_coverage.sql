-- On-demand coverage: parking outside the seeded region is imported from
-- OpenStreetMap the first time someone searches there. Each ~4 km grid cell is
-- fetched once (re-tried after a failure, refreshed after 30 days).

create table public.osm_coverage (
  cell text primary key,              -- "<lat_index>:<lng_index>" on a 0.04° grid
  status text not null check (status in ('ok', 'failed')),
  location_count integer not null default 0,
  fetched_at timestamptz not null default now()
);

alter table public.osm_coverage enable row level security;
-- No policies: only the server (service role) reads or writes this table.
