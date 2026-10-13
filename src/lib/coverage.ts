import "server-only";

import { osmToRow, overpassRace, parkingQuery } from "@/lib/osm";
import { createAdminClient } from "@/lib/supabase/server";

const CELL = 0.025; // degrees (~2.8 km north–south)
const REFRESH_DAYS = 30;
const RETRY_FAILED_MINUTES = 1;

const cellOf = (lat: number, lng: number) => ({ i: Math.floor(lat / CELL), j: Math.floor(lng / CELL) });

/**
 * Ensures OpenStreetMap parking is loaded for every grid cell within ~1.5 km
 * of the point (so searches near a cell edge still see parking across it).
 * Missing cells are fetched in ONE Overpass request (public servers rate-limit
 * parallel queries). Never throws: search still works with existing data.
 */
export async function ensureCoverageAround(lat: number, lng: number): Promise<{ imported: number; fetched: boolean; failed: boolean }> {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { imported: 0, fetched: false, failed: false };
  }

  const d = 0.01; // ~1.1 km
  const cells = new Map<string, { i: number; j: number }>();
  for (const [a, b] of [
    [lat, lng], [lat + d, lng], [lat - d, lng], [lat, lng + d], [lat, lng - d],
    [lat + d, lng + d], [lat + d, lng - d], [lat - d, lng + d], [lat - d, lng - d],
  ]) {
    const c = cellOf(a, b);
    cells.set(`${c.i}:${c.j}`, c);
  }

  const { data: known } = await admin.from("osm_coverage").select("cell, status, fetched_at").in("cell", [...cells.keys()]);
  const now = Date.now();
  const missing = [...cells.entries()].filter(([key]) => {
    const k = known?.find((r) => r.cell === key);
    if (!k) return true;
    const ageMin = (now - new Date(k.fetched_at).getTime()) / 60000;
    return k.status === "ok" ? ageMin > REFRESH_DAYS * 1440 : ageMin > RETRY_FAILED_MINUTES;
  });
  if (missing.length === 0) return { imported: 0, fetched: false, failed: false };

  const margin = 0.005;
  const s = Math.min(...missing.map(([, c]) => c.i)) * CELL - margin;
  const w = Math.min(...missing.map(([, c]) => c.j)) * CELL - margin;
  const n = (Math.max(...missing.map(([, c]) => c.i)) + 1) * CELL + margin;
  const e = (Math.max(...missing.map(([, c]) => c.j)) + 1) * CELL + margin;
  const stamp = new Date().toISOString();
  try {
    const elements = await overpassRace(parkingQuery(s, w, n, e, 25), 28_000);
    const seen = new Set<string>();
    const rows = elements
      .map((el) => osmToRow(el, { relaxed: true }))
      .filter((r): r is NonNullable<typeof r> => r !== null && !seen.has(r.external_id) && Boolean(seen.add(r.external_id)))
      .slice(0, 1500);
    for (let k = 0; k < rows.length; k += 150) {
      // ignoreDuplicates: never overwrite curated/seeded rows (e.g. SF data).
      const { error } = await admin.from("parking_locations").upsert(rows.slice(k, k + 150), { onConflict: "external_id", ignoreDuplicates: true });
      if (error) throw error;
    }
    await admin.from("osm_coverage").upsert(missing.map(([cell]) => ({ cell, status: "ok", location_count: rows.length, fetched_at: stamp })));
    return { imported: rows.length, fetched: true, failed: false };
  } catch (err) {
    console.error("OSM coverage fetch failed", err instanceof Error ? err.message : err);
    await admin.from("osm_coverage").upsert(missing.map(([cell]) => ({ cell, status: "failed", location_count: 0, fetched_at: stamp })));
    return { imported: 0, fetched: false, failed: true };
  }
}
