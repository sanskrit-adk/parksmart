import { ApiError, handler, ok } from "@/lib/api";
import { SF_CENTER } from "@/lib/geo";
import { demandForecast } from "@/lib/ml/demand";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

/** Area demand forecast (traditional ML): peak hours, busiest places, expected free spaces. */
export const GET = handler(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get("lat") ?? SF_CENTER.lat);
  const lng = Number(sp.get("lng") ?? SF_CENTER.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new ApiError(400, "Invalid location");
  const supabase = await createClient();
  try {
    const report = await demandForecast(supabase, { lat, lng });
    return ok({ report }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
  } catch {
    throw new ApiError(500, "Could not build the demand forecast");
  }
});
