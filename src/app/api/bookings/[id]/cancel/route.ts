import { handler, ok, requireUser } from "@/lib/api";
import { loadOwnBooking } from "@/lib/booking-access";
import { cancelBooking } from "@/lib/bookings";
import { refundFor } from "@/lib/pricing";

/** GET previews the refund the cancellation policy allows; POST performs it. */
export const GET = handler(async (_req: Request, ctx: RouteContext<"/api/bookings/[id]/cancel">) => {
  const { id } = await ctx.params;
  const { profile } = await requireUser();
  const { booking } = await loadOwnBooking(id, profile);
  return ok({ refund: refundFor(booking) });
});

export const POST = handler(async (_req: Request, ctx: RouteContext<"/api/bookings/[id]/cancel">) => {
  const { id } = await ctx.params;
  const { profile } = await requireUser();
  const { booking } = await loadOwnBooking(id, profile);
  const result = await cancelBooking(booking);
  return ok(result);
});
