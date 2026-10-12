import "server-only";

import type Stripe from "stripe";
import { ApiError } from "@/lib/api";
import { dateTime, duration } from "@/lib/format";
import { priceBreakdown, refundFor } from "@/lib/pricing";
import { getStripe, toCents } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";
import type { Booking, ParkingLocation } from "@/lib/types";

type Admin = ReturnType<typeof createAdminClient>;

function requireStripe() {
  const stripe = getStripe();
  if (!stripe) throw new ApiError(503, "Payments are not configured (missing STRIPE_SECRET_KEY)");
  return stripe;
}

/** Stripe Checkout for a freshly created hold. */
export async function createBookingCheckout(booking: Booking, location: Pick<ParkingLocation, "name" | "address">, origin: string, email?: string) {
  const stripe = requireStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: email,
    client_reference_id: booking.id,
    // Stripe requires >= 30 minutes; the DB hold lasts 32.
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: toCents(booking.price_breakdown.subtotal),
          product_data: {
            name: `Parking at ${location.name}`,
            description: `${dateTime(booking.start_time)} · ${duration(booking.price_breakdown.hours)}${location.address ? ` · ${location.address}` : ""}`,
          },
        },
      },
      ...(booking.price_breakdown.service_fee > 0
        ? [{
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: toCents(booking.price_breakdown.service_fee),
              product_data: { name: "ParkSmart service fee" },
            },
          }]
        : []),
    ],
    metadata: { kind: "booking", booking_id: booking.id },
    payment_intent_data: { metadata: { kind: "booking", booking_id: booking.id } },
    success_url: `${origin}/bookings/${booking.id}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/book/${booking.location_id}?cancelled=${booking.id}`,
  });
  await createAdminClient().from("bookings").update({ stripe_checkout_session_id: session.id }).eq("id", booking.id);
  return session;
}

/**
 * Idempotently applies a completed Checkout session. Called by the webhook
 * and by the confirmation page (so local dev works without `stripe listen`).
 */
export async function applyCheckoutSession(sessionOrId: string | Stripe.Checkout.Session) {
  const stripe = requireStripe();
  const session = typeof sessionOrId === "string" ? await stripe.checkout.sessions.retrieve(sessionOrId) : sessionOrId;
  if (session.payment_status !== "paid") return { applied: false as const, reason: "unpaid" };
  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const admin = createAdminClient();

  if (session.metadata?.kind === "extension") {
    return applyExtension(admin, session.metadata.extension_id, paymentIntent);
  }

  const bookingId = session.metadata?.booking_id;
  if (!bookingId) return { applied: false as const, reason: "no booking" };
  const { data: booking } = await admin.from("bookings").select("*").eq("id", bookingId).single<Booking>();
  if (!booking) return { applied: false as const, reason: "missing booking" };
  if (booking.stripe_payment_id) return { applied: true as const, booking };

  const nextStatus = new Date(booking.start_time) <= new Date() ? "active" : "upcoming";
  const { data: updated, error } = await admin
    .from("bookings")
    .update({ status: nextStatus, stripe_payment_id: paymentIntent, hold_expires_at: null, cancelled_at: null })
    .eq("id", bookingId)
    .select("*")
    .single<Booking>();

  if (error) {
    // The hold expired and someone else took the space meanwhile: refund in full.
    if (paymentIntent) {
      await stripe.refunds.create({ payment_intent: paymentIntent }, { idempotencyKey: `late-refund-${bookingId}` });
    }
    await admin.from("bookings").update({ status: "cancelled", stripe_payment_id: paymentIntent, refund_amount: booking.total_price, cancelled_at: new Date().toISOString() }).eq("id", bookingId);
    await admin.from("notifications").insert({
      user_id: booking.user_id,
      kind: "booking",
      title: "Payment refunded",
      body: "Your hold expired before payment completed and the space was taken. We refunded you in full.",
      link: `/bookings/${bookingId}`,
    });
    return { applied: false as const, reason: "conflict-refunded" };
  }
  return { applied: true as const, booking: updated };
}

async function applyExtension(admin: Admin, extensionId: string | undefined, paymentIntent: string | null) {
  if (!extensionId) return { applied: false as const, reason: "no extension" };
  const { data: ext } = await admin.from("booking_extensions").select("*").eq("id", extensionId).single();
  if (!ext) return { applied: false as const, reason: "missing extension" };
  if (ext.status === "paid") return { applied: true as const };
  const { error } = await admin.from("bookings").update({ end_time: ext.new_end_time, ending_notified: false }).eq("id", ext.booking_id);
  if (error) {
    const stripe = requireStripe();
    if (paymentIntent) await stripe.refunds.create({ payment_intent: paymentIntent }, { idempotencyKey: `ext-refund-${extensionId}` });
    await admin.from("booking_extensions").update({ status: "failed", stripe_payment_id: paymentIntent }).eq("id", extensionId);
    return { applied: false as const, reason: "conflict-refunded" };
  }
  await admin.from("booking_extensions").update({ status: "paid", stripe_payment_id: paymentIntent }).eq("id", extensionId);
  // Keep the booking total in sync with what was paid overall.
  const { data: b } = await admin.from("bookings").select("total_price, price_breakdown").eq("id", ext.booking_id).single();
  if (b) {
    const bd = b.price_breakdown as Booking["price_breakdown"];
    const addedHours = (new Date(ext.new_end_time).getTime() - new Date(ext.old_end_time).getTime()) / 3_600_000;
    await admin.from("bookings").update({
      total_price: Number(b.total_price) + Number(ext.amount),
      price_breakdown: { ...bd, hours: Math.round((bd.hours + addedHours) * 100) / 100, subtotal: bd.subtotal + Number(ext.amount), total: bd.total + Number(ext.amount) },
    }).eq("id", ext.booking_id);
  }
  return { applied: true as const };
}

/** Prices an extension and either applies it (free) or returns a Checkout URL. */
export async function extendBooking(booking: Booking, location: ParkingLocation, extraMinutes: number, origin: string, email?: string) {
  if (!["upcoming", "active"].includes(booking.status)) throw new ApiError(400, "Only upcoming or active bookings can be extended");
  const oldEnd = new Date(booking.end_time);
  if (oldEnd <= new Date()) throw new ApiError(400, "This booking has already ended");
  const newEnd = new Date(oldEnd.getTime() + extraMinutes * 60_000);
  if (newEnd.getTime() - new Date(booking.start_time).getTime() > 24 * 3_600_000) throw new ApiError(400, "Bookings can't exceed 24 hours");

  const admin = createAdminClient();
  const { count } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("spot_id", booking.spot_id)
    .neq("id", booking.id)
    .in("status", ["pending_payment", "upcoming", "active"])
    .lt("start_time", newEnd.toISOString())
    .gt("end_time", oldEnd.toISOString());
  if (count) throw new ApiError(409, "Your space is booked by someone else right after you. Try a shorter extension.");

  const amount = priceBreakdown(Number(location.hourly_price), oldEnd, newEnd).subtotal;
  const { data: ext, error } = await admin
    .from("booking_extensions")
    .insert({ booking_id: booking.id, user_id: booking.user_id, old_end_time: oldEnd.toISOString(), new_end_time: newEnd.toISOString(), amount })
    .select("*")
    .single();
  if (error || !ext) throw new ApiError(500, "Could not create the extension");

  if (amount === 0) {
    await applyExtension(admin, ext.id, null);
    return { url: null, new_end_time: newEnd.toISOString(), amount };
  }
  const stripe = requireStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: email,
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: Math.max(50, toCents(amount)),
        product_data: { name: `Extend parking at ${location.name}`, description: `+${duration(extraMinutes / 60)} until ${dateTime(newEnd.toISOString())}` },
      },
    }],
    metadata: { kind: "extension", extension_id: ext.id, booking_id: booking.id },
    payment_intent_data: { metadata: { kind: "extension", extension_id: ext.id } },
    success_url: `${origin}/bookings/${booking.id}?session_id={CHECKOUT_SESSION_ID}&extended=1`,
    cancel_url: `${origin}/bookings?tab=${booking.status === "active" ? "active" : "upcoming"}`,
  });
  await admin.from("booking_extensions").update({ stripe_checkout_session_id: session.id }).eq("id", ext.id);
  return { url: session.url, new_end_time: newEnd.toISOString(), amount };
}

export async function checkIn(booking: Pick<Booking, "id" | "status" | "start_time" | "end_time">) {
  if (!["upcoming", "active"].includes(booking.status)) throw new ApiError(400, "This booking can't be checked in");
  const now = Date.now();
  if (new Date(booking.start_time).getTime() - now > 30 * 60_000) throw new ApiError(400, "Check-in opens 30 minutes before your start time");
  if (new Date(booking.end_time).getTime() <= now) throw new ApiError(400, "This booking has ended");
  const { data, error } = await createAdminClient()
    .from("bookings")
    .update({
      status: "active",
      checked_in_at: new Date().toISOString(),
      // Arriving early starts the booking now (the window is shifted, not extended).
      ...(new Date(booking.start_time).getTime() > now ? { start_time: new Date().toISOString() } : {}),
    })
    .eq("id", booking.id)
    .select("*")
    .single<Booking>();
  if (error) throw new ApiError(409, "Your space isn't free yet — the previous booking hasn't ended.");
  return { booking: data };
}

export async function cancelBooking(booking: Booking) {
  if (!["pending_payment", "upcoming", "active"].includes(booking.status)) {
    throw new ApiError(400, "This booking can't be cancelled");
  }
  const refund = refundFor({ ...booking, total_price: Number(booking.total_price) });
  if (refund.amount > 0 && booking.stripe_payment_id) {
    const stripe = requireStripe();
    await stripe.refunds.create(
      { payment_intent: booking.stripe_payment_id, amount: toCents(refund.amount) },
      { idempotencyKey: `cancel-${booking.id}` },
    );
  }
  if (booking.stripe_checkout_session_id && booking.status === "pending_payment") {
    await getStripe()?.checkout.sessions.expire(booking.stripe_checkout_session_id).catch(() => undefined);
  }
  const { data, error } = await createAdminClient()
    .from("bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), refund_amount: refund.amount })
    .eq("id", booking.id)
    .select("*")
    .single<Booking>();
  if (error) throw new ApiError(500, "Could not cancel the booking");
  return { booking: data, refund };
}
