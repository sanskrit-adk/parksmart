import { ApiError, handler, ok, parseJson, requireUser } from "@/lib/api";
import { listingSchema } from "@/lib/schemas";

const patchSchema = listingSchema.partial().extend({
  is_active: listingSchema.shape.covered.optional(),
});

export const PATCH = handler(async (req: Request, ctx: RouteContext<"/api/host/locations/[id]">) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, patchSchema);
  const { supabase, profile } = await requireUser(["host", "admin"]);

  const { lat, lng, ...rest } = body;
  const update: Record<string, unknown> = { ...rest };
  if (lat !== undefined && lng !== undefined) update.geom = `SRID=4326;POINT(${lng} ${lat})`;

  let query = supabase.from("parking_locations").update(update).eq("id", id);
  if (profile.role !== "admin") query = query.eq("host_id", profile.id);
  const { data, error } = await query.select("*").maybeSingle();
  if (error) throw new ApiError(400, "Could not save changes");
  if (!data) throw new ApiError(404, "Listing not found");
  return ok({ location: data });
});
