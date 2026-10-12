import { ApiError, handler, ok, requireUser } from "@/lib/api";
import { getOpenAI, models, structured } from "@/lib/ai/openai";
import { checkIn } from "@/lib/bookings";
import { normalizePlate } from "@/lib/format";
import { dataUrl, readImageField } from "@/lib/images";
import { createAdminClient } from "@/lib/supabase/server";
import type { Booking, NearbyLocation } from "@/lib/types";

export const maxDuration = 30;

/**
 * License plate check-in. Reads the plate from a photo (vision model) or
 * accepts it typed, matches it to the driver's account, and starts the
 * booking. Photos are processed in memory and never stored.
 */
export const POST = handler(async (req: Request) => {
  const { supabase, profile } = await requireUser();
  const form = await req.formData().catch(() => {
    throw new ApiError(400, "Send the photo as multipart/form-data");
  });
  const lat = Number(form.get("lat"));
  const lng = Number(form.get("lng"));
  const hasPosition = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0;

  let plate = normalizePlate(String(form.get("plate") ?? ""));
  let confidence = 1;
  let engine: "typed" | "vision" = "typed";

  if (!plate) {
    const image = await readImageField(form);
    if (!image) throw new ApiError(400, "Take a photo of your plate or type it in");
    if (!getOpenAI()) throw new ApiError(503, "Plate recognition needs OPENAI_API_KEY. You can type your plate instead.");
    const read = await structured<{ plate: string | null; state: string | null; confidence: number }>({
      name: "plate_read",
      model: models().vision,
      maxTokens: 200,
      system:
        "Read the vehicle license plate in the photo. Return only characters printed on the plate (letters and digits, no spaces or symbols). " +
        "If no plate is legible, return null. Confidence is 0..1.",
      user: [
        { type: "text", text: "Read this license plate." },
        { type: "image_url", image_url: { url: dataUrl(image.bytes, image.type), detail: "high" } },
      ],
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["plate", "state", "confidence"],
        properties: {
          plate: { type: ["string", "null"] },
          state: { type: ["string", "null"] },
          confidence: { type: "number" },
        },
      },
    });
    plate = normalizePlate(read.plate ?? "");
    confidence = read.confidence;
    engine = "vision";
    if (!plate || plate.length < 2) throw new ApiError(422, "We couldn't read a plate. Move closer, avoid glare, or type it in.");
  }

  const { data: vehicles } = await supabase.from("vehicles").select("plate").eq("user_id", profile.id);
  const ownPlates = new Set([...(vehicles ?? []).map((v) => v.plate), profile.vehicle_plate ? normalizePlate(profile.vehicle_plate) : ""].filter(Boolean));
  const onAccount = ownPlates.has(plate);

  // A booking that can be checked in now: starts within 30 min or already running.
  const now = new Date();
  const { data: candidates } = await createAdminClient()
    .from("bookings")
    .select("*")
    .eq("user_id", profile.id)
    .in("status", ["upcoming", "active"])
    .lte("start_time", new Date(now.getTime() + 30 * 60_000).toISOString())
    .gt("end_time", now.toISOString())
    .order("start_time");
  const booking = ((candidates ?? []) as Booking[]).find((b) => !b.vehicle_plate || b.vehicle_plate === plate);

  if (booking && (onAccount || booking.vehicle_plate === plate)) {
    if (!booking.vehicle_plate) await createAdminClient().from("bookings").update({ vehicle_plate: plate }).eq("id", booking.id);
    const result = booking.checked_in_at ? { booking } : await checkIn(booking);
    const { data: loc } = await supabase.from("parking_locations").select("name").eq("id", booking.location_id).single();
    return ok({ status: "checked_in", plate, confidence, engine, on_account: onAccount, booking: result.booking, location_name: loc?.name ?? null });
  }

  // No booking to start: suggest the nearest location so the driver can book on the spot.
  let nearest: NearbyLocation | null = null;
  if (hasPosition) {
    const { data } = await supabase.rpc("nearby_locations", { p_lat: lat, p_lng: lng, p_radius_m: 250, p_limit: 1 });
    nearest = ((data ?? []) as NearbyLocation[])[0] ?? null;
  }
  return ok({
    status: onAccount ? "no_booking" : "not_on_account",
    plate,
    confidence,
    engine,
    on_account: onAccount,
    pending_booking: booking ? { id: booking.id, vehicle_plate: booking.vehicle_plate } : null,
    nearest: nearest ? { id: nearest.id, name: nearest.name, distance_m: Math.round(Number(nearest.distance_m)), hourly_price: Number(nearest.hourly_price) } : null,
  });
});
