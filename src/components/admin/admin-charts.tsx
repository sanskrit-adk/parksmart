"use client";

import { SeriesChart } from "@/components/charts/series-chart";
import { money, shortDate } from "@/lib/format";

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;

export function AdminCharts({
  occupancy,
  bookingsByHour,
  revenueTrend,
}: {
  occupancy: { hour: number; rate: number }[];
  bookingsByHour: { hour: number; count: number }[];
  revenueTrend: { day: string; revenue: number }[];
}) {
  const fill = <T,>(rows: { hour: number }[], pick: (h: number) => T) => Array.from({ length: 24 }, (_, h) => pick(h));
  const occ = fill(occupancy, (h) => ({ label: hourLabel(h), value: Math.round(Number(occupancy.find((o) => o.hour === h)?.rate ?? 0) * 100) }));
  const bk = fill(bookingsByHour, (h) => ({ label: hourLabel(h), value: Number(bookingsByHour.find((o) => o.hour === h)?.count ?? 0) }));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border bg-card p-5 shadow-soft">
        <SeriesChart title="Observed occupancy by hour (last 7 days, live lots)" valueLabel="Occupied" data={occ} format={(v) => `${v}%`} yMax={100} />
      </div>
      <div className="rounded-2xl border bg-card p-5 shadow-soft">
        <SeriesChart title="Bookings by start hour (today)" valueLabel="Bookings" data={bk} />
      </div>
      <div className="rounded-2xl border bg-card p-5 shadow-soft lg:col-span-2">
        <SeriesChart
          kind="area"
          title="Net revenue, last 14 days"
          valueLabel="Revenue"
          data={revenueTrend.map((r) => ({ label: shortDate(`${r.day}T12:00:00Z`), value: Number(r.revenue) }))}
          format={(v) => money(v, { compact: true })}
        />
      </div>
    </div>
  );
}
