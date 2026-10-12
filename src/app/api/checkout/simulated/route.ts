import { z } from "zod";
import { ApiError, handler, ok, parseJson, requireUser } from "@/lib/api";
import { applySimulatedPayment } from "@/lib/bookings";

const schema = z.union([z.object({ booking_id: z.string().uuid() }), z.object({ extension_id: z.string().uuid() })]);

/** Completes a simulated checkout (local testing without Stripe). */
export const POST = handler(async (req: Request) => {
  const body = await parseJson(req, schema);
  const { profile } = await requireUser();
  const result = await applySimulatedPayment(
    "booking_id" in body ? { bookingId: body.booking_id } : { extensionId: body.extension_id },
    profile.id,
  );
  if (!result.applied) {
    throw new ApiError(409, result.reason === "conflict-refunded" ? "Your hold expired and the space was taken. Nothing was charged." : "Payment couldn't be applied");
  }
  return ok({ booking_id: result.bookingId });
});
