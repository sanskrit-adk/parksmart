"use client";

import { CalendarClockIcon, ClockIcon, DollarSignIcon, MapPinIcon, SearchIcon, SparklesIcon, TicketIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SeriesChart } from "@/components/charts/series-chart";
import { DemoBadge, heatClass, useMounted } from "@/components/demo/demo-bits";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { DAYS, bestArrival, demoEvents, eventBoost, eventForecast, fmtHour, NEIGHBORHOODS, neighborhood, range, weekday, weekGrid } from "@/lib/demo/data";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

const HOURS = range(6, 24);

export function Planner({ initialArea }: { initialArea?: string }) {
  const mounted = useMounted();
  const [area, setArea] = useState(NEIGHBORHOODS.some((n) => n.id === initialArea) ? initialArea! : "mission-bay");
  // Day offset from today (0–6) so events line up with real dates.
  const [offset, setOffset] = useState(0);
  const [hour, setHour] = useState(11);

  const n = neighborhood(area);
  const date = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d;
  }, [offset]);
  const day = weekday(date);

  const events = useMemo(() => (mounted ? demoEvents() : []), [mounted]);
  const dayEvents = events.filter((e) => e.neighborhoodId === area && e.starts.toDateString() === date.toDateString());
  const boost = (h: number) => {
    const at = new Date(date);
    at.setHours(h, 0, 0, 0);
    return Math.max(0, ...dayEvents.map((e) => eventBoost(e, at)));
  };

  const grid = useMemo(() => weekGrid(n, HOURS), [n]);
  const plan = bestArrival(n, day, hour, boost);
  const { best, requested } = plan;
  const better = best.hour !== requested.hour;

  if (!mounted) return <div className="h-[600px] animate-pulse rounded-3xl bg-muted" />;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-2xl border bg-card p-5 shadow-soft sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="area">Where are you going?</Label>
          <NativeSelect id="area" value={area} onChange={(e) => setArea(e.target.value)}>
            {NEIGHBORHOODS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="day">Day</Label>
          <NativeSelect id="day" value={offset} onChange={(e) => setOffset(Number(e.target.value))}>
            {range(0, 7).map((o) => {
              const d = new Date();
              d.setDate(d.getDate() + o);
              return (
                <option key={o} value={o}>
                  {o === 0 ? "Today" : o === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "long" })} · {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </option>
              );
            })}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hour">Planned arrival</Label>
          <NativeSelect id="hour" value={hour} onChange={(e) => setHour(Number(e.target.value))}>
            {range(6, 23).map((h) => (
              <option key={h} value={h}>
                {fmtHour(h)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {dayEvents.map((e) => {
        const f = eventForecast(e);
        return (
          <div key={e.id} className="flex gap-3 rounded-2xl border border-filling/50 bg-filling/10 p-4 text-sm">
            <TicketIcon className="mt-0.5 size-5 shrink-0" aria-hidden />
            <p>
              <strong>{e.name}</strong> at {e.venue}, {fmtHour(e.starts.getHours())}. Parking in {n.name} is expected to be about {Math.round(f.withEvent * 100)}% full from {f.window}.
              Consider {f.alternative.name} (about a {f.walkMinutes}-min walk or short ride).
            </p>
          </div>
        );
      })}

      <section aria-labelledby="rec-title" className="rounded-3xl bg-navy p-6 text-white sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p id="rec-title" className="flex items-center gap-2 text-sm text-teal">
            <SparklesIcon className="size-4" aria-hidden /> Best time to park
          </p>
          <DemoBadge className="border-white/40 bg-white/10 text-white" />
        </div>
        <p className="mt-3 text-2xl font-semibold sm:text-3xl">
          {better ? `Arrive at ${fmtHour(best.hour)} instead of ${fmtHour(requested.hour)}` : `${fmtHour(requested.hour)} is already a good time`}
        </p>
        <p className="mt-2 max-w-2xl text-white/80">
          {better
            ? `About ${Math.round((best.chance - requested.chance) * 100)} points more likely to find a space${
                best.price < requested.price ? `, ${money(requested.price - best.price)}/hr cheaper` : ""
              } and roughly ${Math.max(0, requested.searchMinutes - best.searchMinutes)} fewer minutes searching.`
            : `Within 3 hours either side, no other time is clearly better for availability and price in ${n.name}.`}
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat icon={MapPinIcon} label="Chance of a free space" value={`${Math.round(best.chance * 100)}%`} />
          <Stat icon={DollarSignIcon} label="Typical price" value={`${money(best.price)}/hr`} />
          <Stat icon={SearchIcon} label="Expected search time" value={`${best.searchMinutes} min`} />
        </div>
        <Link href={`/find?q=${encodeURIComponent(`parking near ${n.name}`)}`} className={cn(buttonVariants({ variant: "teal" }), "mt-6")}>
          Find parking in {n.name}
        </Link>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-5 shadow-soft">
          <SeriesChart
            title={`Chance of a free space by arrival time · ${DAYS[day]}`}
            valueLabel="Chance of a free space"
            data={plan.options.map((o) => ({ label: fmtHour(o.hour), value: Math.round(o.chance * 100), highlight: o.hour === best.hour }))}
            format={(v) => `${v}%`}
            yMax={100}
          />
        </section>
        <section className="rounded-2xl border bg-card p-5 shadow-soft">
          <SeriesChart
            title={`Typical hourly price by arrival time · ${DAYS[day]}`}
            valueLabel="Price per hour"
            data={plan.options.map((o) => ({ label: fmtHour(o.hour), value: o.price, highlight: o.hour === best.hour }))}
            format={(v) => money(v)}
          />
        </section>
      </div>

      <section aria-labelledby="heat-title" className="rounded-2xl border bg-card p-5 shadow-soft">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 id="heat-title" className="flex items-center gap-2 font-semibold">
            <CalendarClockIcon className="size-4 text-teal-strong" aria-hidden /> Weekly demand in {n.name}
          </h2>
          <DemoBadge />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-0.5 text-[11px]">
            <thead>
              <tr>
                <th className="w-10" />
                {HOURS.map((h) => (
                  <th key={h} scope="col" className="font-normal text-muted-foreground">
                    {h % 3 === 0 ? fmtHour(h).replace(" ", "") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className={cn("pr-1 text-left font-medium", row.day === day && "text-teal-strong")}>
                    {row.label}
                  </th>
                  {row.cells.map((c) => (
                    <td
                      key={c.hour}
                      title={`${row.label} ${fmtHour(c.hour)}: ${Math.round(c.demand * 100)}% full`}
                      className={cn("h-7 rounded-sm text-center", heatClass(c.demand), row.day === day && c.hour === hour && "ring-2 ring-teal")}
                    >
                      <span className="sr-only">{Math.round(c.demand * 100)}% full</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>Less busy</span>
          {[0.1, 0.3, 0.45, 0.6, 0.75, 0.9].map((d) => (
            <span key={d} className={cn("h-3 w-6 rounded-sm", heatClass(d))} aria-hidden />
          ))}
          <span>Busier</span>
          <span className="ml-auto inline-flex items-center gap-1">
            <ClockIcon className="size-3" aria-hidden /> Outlined cell = your planned arrival
          </span>
        </div>
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof MapPinIcon; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/10 p-3">
      <p className="flex items-center gap-1.5 text-xs text-white/70">
        <Icon className="size-3.5" aria-hidden /> {label}
      </p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
