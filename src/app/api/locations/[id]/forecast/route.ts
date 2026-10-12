import { ApiError, handler, ok } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import type { ForecastPoint } from "@/lib/types";

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/locations/[id]/forecast">) => {
  const { id } = await ctx.params;
  const from = new URL(req.url).searchParams.get("from");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("location_forecast", {
    p_location_id: id,
    p_from: from && !Number.isNaN(Date.parse(from)) ? from : new Date().toISOString(),
    p_hours: 24,
  });
  if (error) throw new ApiError(500, "Could not load the forecast");
  const points = ((data ?? []) as ForecastPoint[]).map((p) => ({
    ts: p.ts,
    occupancy_rate: Number(p.occupancy_rate),
    free_probability: Number(p.free_probability),
  }));
  return ok({ points });
});
