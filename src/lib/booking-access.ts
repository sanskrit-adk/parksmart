import "server-only";

import { ApiError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/server";
import type { Booking, ParkingLocation, Profile } from "@/lib/types";

/** Loads a booking the caller owns (admins may act on any booking). */
export async function loadOwnBooking(id: string, profile: Profile) {
  const admin = createAdminClient();
  const { data: booking } = await admin.from("bookings").select("*").eq("id", id).maybeSingle<Booking>();
  if (!booking || (booking.user_id !== profile.id && profile.role !== "admin")) {
    throw new ApiError(404, "Booking not found");
  }
  const { data: location } = await admin.from("parking_locations").select("*").eq("id", booking.location_id).single<ParkingLocation>();
  if (!location) throw new ApiError(404, "Location not found");
  return {
    booking: { ...booking, total_price: Number(booking.total_price) },
    location: { ...location, hourly_price: Number(location.hourly_price) },
  };
}
