"use client";

import { ArrowRightIcon, TicketIcon, TrendingUpIcon, UsersIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DemoBadge, useMounted } from "@/components/demo/demo-bits";
import { demoEvents, distanceKm, eventForecast, fmtHour, neighborhood, type DemoEvent } from "@/lib/demo/data";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

const when = (e: DemoEvent) => {
  const today = new Date().toDateString() === e.starts.toDateString();
  const tomorrow = new Date(Date.now() + 86_400_000).toDateString() === e.starts.toDateString();
  const day = today ? "Today" : tomorrow ? "Tomorrow" : e.starts.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${day}, ${fmtHour(e.starts.getHours())}–${fmtHour(e.ends.getHours())}`;
};

/** Compact, dismissible alert for the next upcoming demo event (Find page). */
export function EventAlertBanner({ className }: { className?: string }) {
  const mounted = useMounted();
  const [hidden, setHidden] = useState(false);
  const e = useMemo(() => (mounted ? demoEvents()[0] : undefined), [mounted]);
  if (!e || hidden) return null;
  const f = eventForecast(e);
  return (
    <div role="status" className={cn("relative flex gap-2.5 rounded-xl border border-filling/50 bg-filling/10 p-3 pr-9 text-sm", className)}>
      <TicketIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-medium">
          {e.name} · {when(e)}
        </p>
        <p className="text-muted-foreground">
          {f.neighborhood.name} parking expected ~{Math.round(f.withEvent * 100)}% full from {f.window}. Try {f.alternative.name} instead.{" "}
          <Link href={`/planner?area=${f.neighborhood.id}`} className="font-medium text-teal-strong hover:underline">
            Plan around it
          </Link>
        </p>
        <DemoBadge className="mt-1.5" />
      </div>
      <button type="button" onClick={() => setHidden(true)} aria-label="Dismiss event alert" className="absolute top-2 right-2 rounded-md p-1 text-muted-foreground hover:bg-muted">
        <XIcon className="size-4" />
      </button>
    </div>
  );
}

/** Full list of upcoming demo events with driver advice. */
export function EventList({ limit }: { limit?: number }) {
  const mounted = useMounted();
  const events = useMemo(() => (mounted ? demoEvents().slice(0, limit) : []), [mounted, limit]);
  if (!mounted) return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {events.map((e) => {
        const f = eventForecast(e);
        return (
          <li key={e.id} className="rounded-2xl border bg-card p-4 shadow-soft">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{e.name}</p>
                <p className="text-sm text-muted-foreground">
                  {e.venue} · {when(e)}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <UsersIcon className="size-3.5" aria-hidden /> {e.attendees.toLocaleString()}
              </span>
            </div>
            <DemandBar label={`${f.neighborhood.name}, normal`} value={f.normal} />
            <DemandBar label={`${f.neighborhood.name}, with event`} value={f.withEvent} strong />
            <p className="mt-3 text-sm">
              Busiest {f.window}. <span className="text-muted-foreground">Alternative:</span> {f.alternative.name} (~{Math.round(f.altDemand * 100)}% full, {f.walkMinutes}-min walk).
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function DemandBar({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-xs">
        <span className={strong ? "font-medium" : "text-muted-foreground"}>{label}</span>
        <span className="tabular-nums">{Math.round(value * 100)}% full</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", value >= 0.85 ? "bg-full" : value >= 0.6 ? "bg-filling" : "bg-free")} style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

/** Host view: events near the host's listings and a suggested event price. */
export function HostEventInsights({ listings }: { listings: { id: string; name: string; lat: number; lng: number; hourly_price: number }[] }) {
  const mounted = useMounted();
  const rows = useMemo(() => {
    if (!mounted) return [];
    return demoEvents().flatMap((e) => {
      const n = neighborhood(e.neighborhoodId);
      return listings
        .map((l) => ({ l, km: distanceKm(l, n) }))
        .filter((x) => x.km <= 3)
        .map(({ l, km }) => {
          const f = eventForecast(e);
          // Effect fades with distance from the event's neighbourhood.
          const factor = Math.max(0.2, 1 - km / 3);
          const pct = Math.round(f.priceIncreasePct * factor);
          return { e, l, km, f, pct, price: Math.round(l.hourly_price * (1 + pct / 100) * 4) / 4 };
        });
    }).slice(0, 6);
  }, [mounted, listings]);

  if (!mounted) return <div className="h-32 animate-pulse rounded-2xl bg-muted" />;
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">No demo events within 3 km of your listings this week.</p>;
  }
  return (
    <ul className="space-y-3">
      {rows.map(({ e, l, km, f, pct, price }) => (
        <li key={`${e.id}-${l.id}`} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-medium">
              <TicketIcon className="size-4 shrink-0 text-teal-strong" aria-hidden /> {e.name}
            </p>
            <p className="text-sm text-muted-foreground">
              {when(e)} · {km.toFixed(1)} km from {l.name}
            </p>
            <p className="mt-1 flex items-center gap-1 text-sm">
              <TrendingUpIcon className="size-3.5 text-teal-strong" aria-hidden /> Area demand {Math.round(f.normal * 100)}% → {Math.round(f.withEvent * 100)}% from {f.window}
            </p>
          </div>
          <div className="shrink-0 rounded-xl bg-muted/60 px-4 py-2 text-right">
            <p className="text-xs text-muted-foreground">Suggested event price</p>
            <p className="font-semibold">
              {money(l.hourly_price)} <ArrowRightIcon className="inline size-3.5" aria-hidden /> {money(price)}/hr
            </p>
            <p className="text-xs text-teal-strong">+{pct}% during the event</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
