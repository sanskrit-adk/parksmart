import { ApiError, handler, ok } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import type { MapLocation } from "@/lib/types";

/** Viewport query for the map: every location inside the visible bounds. */
export const GET = handler(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const num = (k: string) => (sp.get(k) === null || sp.get(k) === "" ? null : Number(sp.get(k)));
  const bool = (k: string) => (sp.get(k) === "true" ? true : null);
  const [minLng, minLat, maxLng, maxLat] = ["minLng", "minLat", "maxLng", "maxLat"].map(num);
  if ([minLng, minLat, maxLng, maxLat].some((v) => v === null || Number.isNaN(v))) {
    throw new ApiError(400, "minLng, minLat, maxLng and maxLat are required");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("locations_in_bounds", {
    p_min_lng: minLng,
    p_min_lat: minLat,
    p_max_lng: maxLng,
    p_max_lat: maxLat,
    p_max_price: num("maxPrice"),
    p_covered: bool("covered"),
    p_ev: bool("ev"),
    p_accessible: bool("accessible"),
    p_limit: 2000,
  });
  if (error) throw new ApiError(500, "Could not load the map");
  const rows = ((data ?? []) as MapLocation[]).map((r) => ({ ...r, hourly_price: Number(r.hourly_price) }));
  return ok({ locations: rows }, { headers: { "Cache-Control": "private, max-age=15" } });
});
