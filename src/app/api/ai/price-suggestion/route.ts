import { z } from "zod";
import { ApiError, handler, ok, parseJson, requireUser } from "@/lib/api";
import { suggestPrice } from "@/lib/ai/pricing-advisor";

const schema = z.union([
  z.object({ location_id: z.string().uuid() }),
  z.object({
    lat: z.number(),
    lng: z.number(),
    type: z.enum(["garage", "lot", "street", "private"]),
    covered: z.boolean(),
    ev_charging: z.boolean(),
    total_spots: z.number().int().min(1),
    current_price: z.number().nullable().optional(),
  }),
]);

/** Dynamic pricing suggestion for a host listing (existing or draft). */
export const POST = handler(async (req: Request) => {
  const body = await parseJson(req, schema);
  const { supabase, profile } = await requireUser();

  if ("location_id" in body) {
    const { data: loc } = await supabase.from("parking_locations").select("*").eq("id", body.location_id).maybeSingle();
    if (!loc || (loc.host_id !== profile.id && profile.role !== "admin")) throw new ApiError(404, "Listing not found");
    return ok(
      await suggestPrice(supabase, {
        location_id: loc.id,
        lat: loc.lat,
        lng: loc.lng,
        type: loc.type,
        covered: loc.covered,
        ev_charging: loc.ev_charging,
        total_spots: loc.total_spots,
        current_price: Number(loc.hourly_price),
      }),
    );
  }
  return ok(await suggestPrice(supabase, body));
});
