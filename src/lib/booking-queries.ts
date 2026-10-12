import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingWithLocation } from "@/lib/types";

const SELECT = "*, location:parking_locations(id, name, address, type, hourly_price, timezone, photos, lat, lng), spot:spots(label)";

function normalize(rows: BookingWithLocation[], reviewed: Set<string>): BookingWithLocation[] {
  return rows.map((b) => ({
    ...b,
    total_price: Number(b.total_price),
    refund_amount: b.refund_amount === null ? null : Number(b.refund_amount),
    location: { ...b.location, hourly_price: Number(b.location.hourly_price) },
    has_review: reviewed.has(b.id),
  }));
}

export async function listUserBookings(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from("bookings").select(SELECT).eq("user_id", userId).order("start_time", { ascending: false }).limit(200);
  const rows = (data ?? []) as BookingWithLocation[];
  const { data: reviews } = await supabase.from("reviews").select("booking_id").eq("user_id", userId);
  return normalize(rows, new Set((reviews ?? []).map((r) => r.booking_id as string)));
}

export async function getUserBooking(supabase: SupabaseClient, id: string) {
  const { data } = await supabase.from("bookings").select(SELECT).eq("id", id).maybeSingle();
  if (!data) return null;
  const { data: review } = await supabase.from("reviews").select("booking_id").eq("booking_id", id).maybeSingle();
  return normalize([data as BookingWithLocation], new Set(review ? [id] : []))[0];
}
