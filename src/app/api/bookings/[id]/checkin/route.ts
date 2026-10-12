import { handler, ok, requireUser } from "@/lib/api";
import { loadOwnBooking } from "@/lib/booking-access";
import { checkIn } from "@/lib/bookings";

/** Manual check-in ("I've arrived"); plate scanning uses /api/ai/plate. */
export const POST = handler(async (_req: Request, ctx: RouteContext<"/api/bookings/[id]/checkin">) => {
  const { id } = await ctx.params;
  const { profile } = await requireUser();
  const { booking } = await loadOwnBooking(id, profile);
  return ok(await checkIn(booking));
});
