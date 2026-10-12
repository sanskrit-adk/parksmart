import { CalendarPlusIcon, CheckCircle2Icon, DownloadIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { BookingActions } from "@/components/booking/booking-actions";
import { Countdown } from "@/components/booking/countdown";
import { BookingStatusBadge } from "@/components/booking/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { requirePageRole } from "@/lib/auth";
import { getUserBooking } from "@/lib/booking-queries";
import { applyCheckoutSession } from "@/lib/bookings";
import { dateTime, duration, money, TYPE_LABEL } from "@/lib/format";
import { googleCalendarUrl } from "@/lib/ics";
import { getStripe } from "@/lib/stripe";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Your booking" };

export default async function BookingPage(props: PageProps<"/bookings/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const { supabase, profile } = await requirePageRole(null, `/bookings/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  // Coming back from Stripe: reconcile immediately (the webhook does the same, idempotently).
  const sessionId = typeof sp.session_id === "string" ? sp.session_id : null;
  let justPaid = false;
  if (sessionId && getStripe()) {
    try {
      const session = await getStripe()!.checkout.sessions.retrieve(sessionId);
      if (session.metadata?.booking_id === id) {
        const r = await applyCheckoutSession(session);
        justPaid = r.applied;
      }
    } catch (err) {
      console.error("Could not reconcile checkout session", err);
    }
  }

  const b = await getUserBooking(supabase, id);
  if (!b || (b.user_id !== profile.id && profile.role !== "admin")) notFound();

  const qrPayload = `PARKSMART:${b.id}:${b.qr_code}`;
  const qr = await QRCode.toDataURL(qrPayload, { margin: 1, width: 480, errorCorrectionLevel: "M", color: { dark: "#152a5cff", light: "#ffffffff" } });
  const calendar = googleCalendarUrl({
    start: b.start_time,
    end: b.end_time,
    title: `Parking · ${b.location.name}`,
    location: b.location.address ?? b.location.name,
    details: `ParkSmart booking ${b.id.slice(0, 8).toUpperCase()}`,
  });
  const live = b.status === "upcoming" || b.status === "active";
  const extended = sp.extended === "1";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 pb-28 sm:px-6">
      <Link href="/bookings" className="text-sm text-muted-foreground hover:text-foreground">
        ← My bookings
      </Link>

      {(justPaid || (sessionId && live)) && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-free/40 bg-free/10 p-4">
          <CheckCircle2Icon className="size-8 shrink-0 text-free" aria-hidden />
          <div>
            <p className="font-semibold">{extended ? "Booking extended!" : "You're booked!"}</p>
            <p className="text-sm text-muted-foreground">A confirmation is in your notifications. Show the QR code on arrival or scan your plate.</p>
          </div>
        </div>
      )}
      {b.status === "pending_payment" && (
        <div className="mt-4 rounded-2xl border border-filling/50 bg-filling/10 p-4 text-sm">
          Payment hasn&apos;t completed yet. If you just paid, refresh in a few seconds. Unpaid holds are released automatically
          {b.hold_expires_at ? ` at ${dateTime(b.hold_expires_at)}` : ""}.
        </div>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_240px]">
        <div className="space-y-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <BookingStatusBadge status={b.status} />
              <span className="text-sm text-muted-foreground">#{b.id.slice(0, 8).toUpperCase()}</span>
            </div>
            <h1 className="mt-2 text-3xl font-bold">{b.location.name}</h1>
            <p className="text-muted-foreground">
              {TYPE_LABEL[b.location.type]}
              {b.location.address ? ` · ${b.location.address}` : ""}
            </p>
          </div>

          {live && (
            <div className="rounded-2xl border bg-card p-5 shadow-soft">
              <Countdown start={b.start_time} end={b.end_time} large />
              {b.checked_in_at && <p className="mt-2 text-sm text-free">Checked in {dateTime(b.checked_in_at, b.location.timezone)}</p>}
            </div>
          )}

          <dl className="grid grid-cols-2 gap-4 rounded-2xl border bg-card p-5 text-sm">
            <Item label="Starts" value={dateTime(b.start_time, b.location.timezone)} />
            <Item label="Ends" value={dateTime(b.end_time, b.location.timezone)} />
            <Item label="Space" value={b.spot.label} />
            <Item label="Vehicle" value={b.vehicle_plate ?? "Not set"} />
            <Item label={`Parking (${duration(b.price_breakdown.hours)})`} value={money(b.price_breakdown.subtotal)} />
            <Item label="Service fee" value={money(b.price_breakdown.service_fee)} />
            <Item label="Total paid" value={money(b.total_price)} strong />
            {b.refund_amount !== null && <Item label="Refunded" value={money(b.refund_amount)} />}
          </dl>

          <BookingActions booking={b} size="default" />

          {b.status !== "cancelled" && (
            <div className="flex flex-wrap gap-2">
              <a href={`/api/bookings/${b.id}/ics`} className={buttonVariants({ variant: "outline" })}>
                <DownloadIcon /> Apple / Outlook calendar
              </a>
              <a href={calendar} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>
                <CalendarPlusIcon /> Google Calendar
              </a>
            </div>
          )}
        </div>

        <div className={cn("rounded-2xl border bg-white p-4 text-center shadow-soft", b.status === "cancelled" && "opacity-40")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt={`Entry QR code for booking ${b.id.slice(0, 8)}`} className="mx-auto w-full max-w-[220px]" />
          <p className="mt-2 text-xs font-medium text-slate-600">{b.status === "cancelled" ? "Cancelled — not valid" : "Show at the entrance"}</p>
          <Link href="/check-in" className="mt-2 inline-block text-xs font-medium text-[oklch(0.5_0.1_192)] hover:underline">
            Or check in with your plate →
          </Link>
        </div>
      </div>
    </div>
  );
}

function Item({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 font-medium", strong && "text-lg font-bold")}>{value}</dd>
    </div>
  );
}
