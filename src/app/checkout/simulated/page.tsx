import { FlaskConicalIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SimulatedCheckout } from "@/components/booking/simulated-checkout";
import { requirePageRole } from "@/lib/auth";
import { simulatedPayments } from "@/lib/env";
import { dateTime, duration, money } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Checkout (simulated)" };

const uuid = /^[0-9a-f-]{36}$/i;

export default async function SimulatedCheckoutPage(props: PageProps<"/checkout/simulated">) {
  const sp = await props.searchParams;
  const bookingId = typeof sp.booking === "string" && uuid.test(sp.booking) ? sp.booking : null;
  const extensionId = typeof sp.extension === "string" && uuid.test(sp.extension) ? sp.extension : null;
  const { profile } = await requirePageRole(null, `/checkout/simulated?${bookingId ? `booking=${bookingId}` : `extension=${extensionId}`}`);
  if (!simulatedPayments() || (!bookingId && !extensionId)) notFound();

  const admin = createAdminClient();
  let title: string;
  let lines: [string, string][];
  let amount: number;
  let cancelHref: string;

  if (bookingId) {
    const { data: b } = await admin.from("bookings").select("*, location:parking_locations(name)").eq("id", bookingId).maybeSingle();
    if (!b || b.user_id !== profile.id) notFound();
    if (b.status !== "pending_payment") {
      return <Done message="This booking is no longer awaiting payment." href={`/bookings/${b.id}`} />;
    }
    title = `Parking at ${(b.location as { name: string }).name}`;
    amount = Number(b.total_price);
    lines = [
      ["Starts", dateTime(b.start_time)],
      ["Duration", duration(b.price_breakdown.hours)],
      ["Parking", money(b.price_breakdown.subtotal)],
      ["Service fee", money(b.price_breakdown.service_fee)],
    ];
    cancelHref = `/book/${b.location_id}?cancelled=${b.id}`;
  } else {
    const { data: e } = await admin.from("booking_extensions").select("*").eq("id", extensionId!).maybeSingle();
    if (!e || e.user_id !== profile.id) notFound();
    if (e.status !== "pending") return <Done message="This extension was already processed." href={`/bookings/${e.booking_id}`} />;
    title = "Extend your booking";
    amount = Number(e.amount);
    lines = [["New end", dateTime(e.new_end_time)]];
    cancelHref = `/bookings/${e.booking_id}`;
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 pb-28">
      <div className="mb-6 flex gap-3 rounded-2xl border border-filling/50 bg-filling/10 p-4 text-sm">
        <FlaskConicalIcon className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p>
          <strong>Simulated payment.</strong> Stripe isn&apos;t configured on this server, so no card is needed and no money moves. Add{" "}
          <code>STRIPE_SECRET_KEY</code> to use real Stripe test checkout.
        </p>
      </div>
      <div className="rounded-2xl border bg-card p-6 shadow-soft">
        <h1 className="text-xl font-bold">{title}</h1>
        <dl className="mt-4 space-y-2 text-sm">
          {lines.map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <dt className="text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t pt-2 text-base font-bold">
            <dt>Total</dt>
            <dd>{money(amount)}</dd>
          </div>
        </dl>
        <div className="mt-6">
          <SimulatedCheckout target={bookingId ? { booking_id: bookingId } : { extension_id: extensionId! }} amount={amount} cancelHref={cancelHref} />
        </div>
      </div>
    </div>
  );
}

function Done({ message, href }: { message: string; href: string }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 text-center">
      <p>{message}</p>
      <Link href={href} className="mt-4 inline-block font-medium text-teal-strong hover:underline">
        View booking
      </Link>
    </div>
  );
}
