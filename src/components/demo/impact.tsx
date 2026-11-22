"use client";

import { ArrowRightIcon, CarIcon, ClockIcon, FuelIcon, LeafIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { SeriesChart } from "@/components/charts/series-chart";
import { DemoBadge, useMounted } from "@/components/demo/demo-bits";
import { demoTrips, IMPACT_ASSUMPTIONS, impactFromTrips, rng } from "@/lib/demo/data";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

function metrics(i: ReturnType<typeof impactFromTrips>) {
  return [
    { icon: ClockIcon, label: "Hours of searching avoided", value: n0(i.hours) },
    { icon: CarIcon, label: "Miles of circling avoided", value: n0(i.miles) },
    { icon: LeafIcon, label: "CO₂ not emitted", value: `${n0(i.co2Kg)} kg` },
    { icon: FuelIcon, label: "Fuel cost saved", value: money(i.fuelCost, { compact: true }) },
  ] satisfies { icon: LucideIcon; label: string; value: string }[];
}

/** Homepage summary strip. */
export function ImpactStrip() {
  const mounted = useMounted();
  const data = useMemo(() => (mounted ? demoTrips() : null), [mounted]);
  if (!data) return <div className="mx-auto h-48 max-w-7xl" />;
  const m = metrics(impactFromTrips(data.total));
  return (
    <section aria-labelledby="impact-strip-title" className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6">
      <div className="rounded-3xl border bg-card p-6 shadow-soft sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold tracking-wide text-teal-strong uppercase">Impact</p>
            <h2 id="impact-strip-title" className="mt-1 text-2xl font-bold sm:text-3xl">
              Less circling, less traffic: last 30 days
            </h2>
          </div>
          <DemoBadge />
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {m.map((x) => (
            <Metric key={x.label} {...x} />
          ))}
        </dl>
        <Link href="/impact" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-teal-strong hover:underline">
          See how we estimate this <ArrowRightIcon className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

/** Full /impact dashboard. */
export function ImpactDashboard() {
  const mounted = useMounted();
  const data = useMemo(() => (mounted ? demoTrips() : null), [mounted]);
  if (!data) return <div className="h-[600px] animate-pulse rounded-3xl bg-muted" />;
  const total = impactFromTrips(data.total);
  const a = IMPACT_ASSUMPTIONS;
  const maxTrips = data.byNeighborhood[0]?.trips ?? 1;

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metrics(total).map((x) => (
          <Metric key={x.label} {...x} card />
        ))}
      </dl>

      <section className="rounded-2xl border bg-card p-5 shadow-soft">
        <SeriesChart
          kind="area"
          title="CO₂ avoided per day (kg)"
          valueLabel="CO₂ avoided"
          data={data.series.map((d) => ({ label: d.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }), value: Math.round(impactFromTrips(d.trips).co2Kg) }))}
          format={(v) => `${v} kg`}
          height={240}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-5 shadow-soft">
          <SeriesChart
            title="Pre-booked trips per day"
            valueLabel="Trips"
            data={data.series.map((d) => ({ label: d.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }), value: d.trips }))}
          />
        </section>
        <section className="rounded-2xl border bg-card p-5 shadow-soft">
          <p className="mb-3 text-sm font-semibold">Search time avoided by neighbourhood</p>
          <ul className="space-y-2.5">
            {data.byNeighborhood.map(({ neighborhood: n, trips }) => {
              const hrs = impactFromTrips(trips).hours;
              return (
                <li key={n.id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <Link href={`/planner?area=${n.id}`} className="hover:underline">
                      {n.name}
                    </Link>
                    <span className="tabular-nums text-muted-foreground">{n0(hrs)} h</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-teal-strong" style={{ width: `${(trips / maxTrips) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section aria-labelledby="method-title" className="rounded-2xl border bg-muted/40 p-5 text-sm">
        <h2 id="method-title" className="font-semibold">
          How we estimate this
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            Trip counts are <strong>generated demo data</strong> ({n0(data.total)} pre-booked trips over 30 days), not real ParkSmart bookings.
          </li>
          <li>
            Without a reservation, a driver in a dense SF neighbourhood is assumed to search about {a.searchMinutesWithout} minutes; with ParkSmart, about {a.searchMinutesWith} minutes to reach the space.
          </li>
          <li>
            Circling speed ≈ {a.cruisingMph} mph, so each minute saved avoids about {(a.cruisingMph / 60).toFixed(2)} miles of driving.
          </li>
          <li>
            CO₂: {a.co2GramsPerMile} g per mile (US EPA average passenger car). Fuel: {a.mpg} mpg at ${a.fuelPricePerGallon.toFixed(2)}/gal.
          </li>
          <li>These are rough averages for illustration. Real impact depends on the trip, the time of day and the vehicle.</li>
        </ul>
      </section>
    </div>
  );
}

/** Profile card: a personal estimate from a demo trip count seeded by the user's id. */
export function PersonalImpactCard({ userId }: { userId: string }) {
  const mounted = useMounted();
  const trips = useMemo(() => {
    let h = 0;
    for (const c of userId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return 6 + Math.floor(rng(h)() * 20);
  }, [userId]);
  if (!mounted) return null;
  const i = impactFromTrips(trips);
  return (
    <section aria-labelledby="my-impact-title" className="rounded-2xl border bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="my-impact-title" className="flex items-center gap-2 font-semibold">
          <LeafIcon className="size-4 text-teal-strong" aria-hidden /> Your impact
        </h2>
        <DemoBadge />
      </div>
      <p className="mt-2 text-sm">
        Your {trips} pre-booked trips saved about <strong>{i.hours.toFixed(1)} hours</strong> of searching, {n0(i.miles)} miles of circling and{" "}
        <strong>{i.co2Kg.toFixed(1)} kg of CO₂</strong>.
      </p>
      <Link href="/impact" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-teal-strong hover:underline">
        How this is estimated <ArrowRightIcon className="size-4" aria-hidden />
      </Link>
    </section>
  );
}

function Metric({ icon: Icon, label, value, card }: { icon: LucideIcon; label: string; value: string; card?: boolean }) {
  return (
    <div className={cn(card ? "rounded-2xl border bg-card p-4 shadow-soft sm:p-5" : "")}>
      <Icon className="size-5 text-teal-strong" aria-hidden />
      <dd className="mt-2 text-2xl font-bold tabular-nums sm:text-3xl">{value}</dd>
      <dt className="text-xs text-muted-foreground sm:text-sm">{label}</dt>
    </div>
  );
}
