import { ApiError, handler, requireUser } from "@/lib/api";
import { loadOwnBooking } from "@/lib/booking-access";
import { bookingIcs } from "@/lib/ics";

/** "Add to calendar" download (works with Apple Calendar, Outlook, Google import). */
export const GET = handler(async (req: Request, ctx: RouteContext<"/api/bookings/[id]/ics">) => {
  const { id } = await ctx.params;
  const { profile } = await requireUser();
  const { booking, location } = await loadOwnBooking(id, profile);
  if (booking.status === "cancelled") throw new ApiError(400, "This booking was cancelled");
  const origin = new URL(req.url).origin;
  const ics = bookingIcs({
    id: booking.id,
    start: booking.start_time,
    end: booking.end_time,
    title: `Parking · ${location.name}`,
    location: location.address ?? location.name,
    description: `ParkSmart booking ${booking.id.slice(0, 8).toUpperCase()}\nShow your QR code on arrival: ${origin}/bookings/${booking.id}`,
    url: `${origin}/bookings/${booking.id}`,
    lat: location.lat,
    lng: location.lng,
  });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="parksmart-${booking.id.slice(0, 8)}.ics"`,
    },
  });
});
