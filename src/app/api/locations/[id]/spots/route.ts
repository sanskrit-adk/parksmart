import { ApiError, handler, ok } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import type { SpotPrediction } from "@/lib/types";

/** Free-probability for every space at a location at `?at=` (default now). */
export const GET = handler(async (req: Request, ctx: RouteContext<"/api/locations/[id]/spots">) => {
  const { id } = await ctx.params;
  const at = new URL(req.url).searchParams.get("at");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("location_spot_predictions", {
    p_location_id: id,
    p_at: at && !Number.isNaN(Date.parse(at)) ? at : new Date().toISOString(),
  });
  if (error) throw new ApiError(500, "Could not load space predictions");
  const spots = ((data ?? []) as SpotPrediction[]).map((s) => ({ ...s, free_probability: Number(s.free_probability) }));
  return ok({ spots });
});
