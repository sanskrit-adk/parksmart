import { ApiError, handler, ok } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import type { SpotForecastPoint } from "@/lib/types";

/** 24-hour free-probability forecast for one space. */
export const GET = handler(async (req: Request, ctx: RouteContext<"/api/spots/[id]/forecast">) => {
  const { id } = await ctx.params;
  const from = new URL(req.url).searchParams.get("from");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("spot_forecast", {
    p_spot_id: id,
    p_from: from && !Number.isNaN(Date.parse(from)) ? from : new Date().toISOString(),
    p_hours: 24,
  });
  if (error) throw new ApiError(500, "Could not load the space forecast");
  const points = ((data ?? []) as SpotForecastPoint[]).map((p) => ({ ...p, free_probability: Number(p.free_probability) }));
  return ok({ points });
});
