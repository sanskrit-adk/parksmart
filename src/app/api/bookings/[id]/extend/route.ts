import { z } from "zod";
import { handler, ok, parseJson, requireUser } from "@/lib/api";
import { loadOwnBooking } from "@/lib/booking-access";
import { extendBooking } from "@/lib/bookings";

const schema = z.object({ minutes: z.number().int().min(15).max(12 * 60) });

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/bookings/[id]/extend">) => {
  const { id } = await ctx.params;
  const { minutes } = await parseJson(req, schema);
  const { profile, user } = await requireUser();
  const { booking, location } = await loadOwnBooking(id, profile);
  const result = await extendBooking(booking, location, minutes, new URL(req.url).origin, user.email);
  return ok(result);
});
