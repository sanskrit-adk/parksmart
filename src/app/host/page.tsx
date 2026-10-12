import { CalendarCheckIcon, DollarSignIcon, GaugeIcon, PlusIcon, SparklesIcon, WarehouseIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BookingStatusBadge } from "@/components/booking/status-badge";
import { EmptyState } from "@/components/empty-state";
import { EarningsChart, ListingActiveToggle } from "@/components/host/host-client";
import { AvailabilityBadge } from "@/components/parking/availability";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageRole } from "@/lib/auth";
import { dateTime, money, TYPE_LABEL } from "@/lib/format";
import type { Booking, ParkingLocation } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Host dashboard" };

export default async function HostPage() {
  const { supabase, profile } = await requirePageRole(null, "/host");
  const { data: listings } = await supabase.from("parking_locations").select("*").eq("host_id", profile.id).order("created_at", { ascending: false });
  const locs = (listings ?? []) as ParkingLocation[];

  if (locs.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 pb-28 sm:px-6">
        <div className="rounded-3xl bg-navy p-8 text-white sm:p-12">
          <WarehouseIcon className="size-10 text-teal" />
          <h1 className="mt-4 text-3xl font-bold sm:text-4xl">Earn from your empty space</h1>
          <p className="mt-3 max-w-lg text-white/75">
            Driveways, garages and lots near busy areas in San Francisco earn every day. Listing takes about 3 minutes, and AI suggests the right price.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-white/85">
            <li className="flex gap-2"><SparklesIcon className="size-4 text-teal" /> AI pricing from nearby rates and demand</li>
            <li className="flex gap-2"><SparklesIcon className="size-4 text-teal" /> Live availability and instant bookings</li>
            <li className="flex gap-2"><SparklesIcon className="size-4 text-teal" /> Optional camera detection for lots</li>
          </ul>
          <Link href="/host/new" className={cn(buttonVariants({ variant: "teal", size: "lg" }), "mt-8")}>
            <PlusIcon /> List your first space
          </Link>
        </div>
      </div>
    );
  }

  const ids = locs.map((l) => l.id);
  const [{ data: earnings }, { data: bookings }] = await Promise.all([
    supabase.rpc("host_earnings", { p_days: 30 }),
    supabase
      .from("bookings")
      .select("*, location:parking_locations(name), spot:spots(label)")
      .in("location_id", ids)
      .in("status", ["upcoming", "active"])
      .order("start_time")
      .limit(20),
  ]);
  const earn = (earnings ?? []) as { day: string; revenue: number; bookings: number }[];
  const total = earn.reduce((s, d) => s + Number(d.revenue), 0);
  const count = earn.reduce((s, d) => s + Number(d.bookings), 0);
  const occ = locs.filter((l) => l.occupancy_rate !== null);
  const avgOcc = occ.length ? occ.reduce((s, l) => s + Number(l.occupancy_rate), 0) / occ.length : 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 pb-28 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Host dashboard</h1>
          <p className="mt-1 text-muted-foreground">Your earnings, listings and upcoming guests.</p>
        </div>
        <Link href="/host/new" className={buttonVariants({ variant: "teal" })}>
          <PlusIcon /> Add a space
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={DollarSignIcon} label="Earnings (30 days)" value={money(total)} />
        <Kpi icon={CalendarCheckIcon} label="Bookings (30 days)" value={String(count)} />
        <Kpi icon={WarehouseIcon} label="Live listings" value={`${locs.filter((l) => l.is_active).length} / ${locs.length}`} />
        <Kpi icon={GaugeIcon} label="Occupied right now" value={`${Math.round(avgOcc * 100)}%`} />
      </div>

      <Card>
        <CardContent>
          {count > 0 ? <EarningsChart data={earn} /> : <EmptyState art="chart" title="No earnings yet" description="Your daily earnings appear here once drivers book." className="py-8" />}
        </CardContent>
      </Card>

      <section aria-labelledby="listings-title">
        <h2 id="listings-title" className="mb-4 text-xl font-semibold">
          Your listings
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {locs.map((l) => (
            <Card key={l.id}>
              <CardHeader>
                <CardTitle className="flex items-start justify-between gap-2">
                  <span className="truncate">{l.name}</span>
                  <ListingActiveToggle id={l.id} active={l.is_active} />
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {TYPE_LABEL[l.type]} · {l.total_spots} space{l.total_spots > 1 ? "s" : ""} · {money(Number(l.hourly_price))}/hr
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <AvailabilityBadge available={l.available_now} total={l.total_spots} mode={l.availability_mode} />
                <div className="flex flex-wrap gap-2">
                  <Link href={`/host/listings/${l.id}`} className={buttonVariants({ size: "sm" })}>
                    Manage
                  </Link>
                  <Link href={`/host/listings/${l.id}?tab=pricing`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                    <SparklesIcon /> AI price
                  </Link>
                  <Link href={`/spots/${l.id}`} className={buttonVariants({ size: "sm", variant: "ghost" })}>
                    Public page
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="guests-title">
        <h2 id="guests-title" className="mb-4 text-xl font-semibold">
          Upcoming guests
        </h2>
        {!bookings?.length ? (
          <EmptyState art="calendar" title="No upcoming bookings" description="New bookings appear here and in your notifications." className="rounded-2xl border py-8" />
        ) : (
          <div className="overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Listing</th>
                  <th className="px-4 py-3 font-medium">Space</th>
                  <th className="px-4 py-3 font-medium">Plate</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(bookings as (Booking & { location: { name: string }; spot: { label: string } })[]).map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="px-4 py-3 whitespace-nowrap">{dateTime(b.start_time)}</td>
                    <td className="px-4 py-3">{b.location.name}</td>
                    <td className="px-4 py-3">{b.spot.label}</td>
                    <td className="px-4 py-3 font-mono">{b.vehicle_plate ?? "—"}</td>
                    <td className="px-4 py-3"><BookingStatusBadge status={b.status} /></td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(Number(b.total_price))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof DollarSignIcon; label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-soft sm:p-5">
      <Icon className="size-5 text-teal-strong" aria-hidden />
      <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
    </div>
  );
}
