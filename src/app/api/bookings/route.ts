import { z } from "zod";
import { ApiError, fromPgError, handler, ok, parseJson, requireUser } from "@/lib/api";
import { createBookingCheckout } from "@/lib/bookings";
import { plateSchema } from "@/lib/schemas";
import { createAdminClient } from "@/lib/supabase/server";
import type { Booking } from "@/lib/types";

const schema = z.object({
  location_id: z.string().uuid(),
  start_time: z.string().datetime({ offset: true }),
  end_time: z.string().datetime({ offset: true }),
  vehicle_plate: plateSchema.optional().nullable(),
});

/** Reserve: creates a priced hold on a free space, then a Stripe Checkout session. */
export const POST = handler(async (req: Request) => {
  const body = await parseJson(req, schema);
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .rpc("create_booking_hold", {
      p_location_id: body.location_id,
      p_start: body.start_time,
      p_end: body.end_time,
      p_vehicle_plate: body.vehicle_plate ?? null,
    })
    .single<Booking>();
  if (error) throw fromPgError(error);
  const booking = { ...data, total_price: Number(data.total_price) };

  if (booking.status !== "pending_payment") {
    return ok({ booking, checkout_url: null });
  }

  const { data: location } = await supabase.from("parking_locations").select("name, address").eq("id", body.location_id).single();
  try {
    const session = await createBookingCheckout(booking, location ?? { name: "ParkSmart", address: null }, new URL(req.url).origin, user.email);
    return ok({ booking, checkout_url: session.url });
  } catch (err) {
    // Don't leave the space blocked if Stripe is unreachable.
    await createAdminClient().from("bookings").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", booking.id);
    if (err instanceof ApiError) throw err;
    console.error(err);
    throw new ApiError(502, "Payment provider unavailable. Your hold was released — please try again.");
  }
});
