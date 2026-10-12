import type { PriceBreakdown } from "@/lib/types";

/** Mirrors public.price_breakdown() so the UI can preview the exact amount. */
export function priceBreakdown(hourly: number, start: Date, end: Date): PriceBreakdown {
  const hours = Math.round(((end.getTime() - start.getTime()) / 3_600_000) * 100) / 100;
  const subtotal = round2(hourly * hours);
  const fee = subtotal === 0 ? 0 : Math.max(0.5, round2(subtotal * 0.05));
  return { hours, hourly_price: hourly, subtotal, service_fee: fee, total: round2(subtotal + fee) };
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Cancellation policy:
 *  - more than 1 hour before start: full refund
 *  - within 1 hour of start: 50% refund of the parking subtotal (fee kept)
 *  - after start: no refund
 */
export function refundFor(
  booking: { start_time: string; total_price: number; price_breakdown: PriceBreakdown; stripe_payment_id: string | null },
  now = new Date(),
) {
  if (!booking.stripe_payment_id || booking.total_price <= 0) {
    return { amount: 0, rule: "No payment was taken", percent: 0 };
  }
  const minutesToStart = (new Date(booking.start_time).getTime() - now.getTime()) / 60000;
  if (minutesToStart > 60) {
    return { amount: round2(booking.total_price), rule: "Full refund (more than 1 hour before start)", percent: 100 };
  }
  if (minutesToStart > 0) {
    return {
      amount: round2(booking.price_breakdown.subtotal * 0.5),
      rule: "50% of parking cost (within 1 hour of start)",
      percent: 50,
    };
  }
  return { amount: 0, rule: "No refund once the booking has started", percent: 0 };
}

export const REFUND_POLICY_TEXT =
  "Free cancellation up to 1 hour before start. Within 1 hour: 50% of the parking cost is refunded. No refund after the booking starts.";
