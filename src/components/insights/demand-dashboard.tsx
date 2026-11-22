"use client";

import { AlertTriangleIcon, ClockIcon, CrosshairIcon, FlameIcon, LineChartIcon, MapPinIcon, MoonIcon, RefreshCwIcon, SquareParkingIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AddressSearch } from "@/components/address-search";
import { SeriesChart } from "@/components/charts/series-chart";
import { PredictedTag } from "@/components/parking/availability";
import { Button } from "@/components/ui/button";
import { useGeolocation } from "@/hooks/use-geolocation";
import { api } from "@/lib/fetcher";
import { money, percent, time, TYPE_LABEL } from "@/lib/format";
import { SF_CENTER } from "@/lib/geo";
import type { DemandReport } from "@/lib/ml/demand";
import { cn } from "@/lib/utils";

const PRESETS = [
  { name: "Downtown SF", lat: SF_CENTER.lat, lng: SF_CENTER.lng },
  { name: "Union Square", lat: 37.788, lng: -122.4075 },
  { name: "Mission District", lat: 37.7599, lng: -122.4148 },
  { name: "Fisherman's Wharf", lat: 37.808, lng: -122.4177 },
];

function demandLevel(rate: number) {
  if (rate >= 0.8) return { label: "Very busy", cls: "bg-full/12 text-full" };
  if (rate >= 0.6) return { label: "Busy", cls: "bg-filling/15 text-[color-mix(in_oklch,var(--filling),black_40%)] dark:text-filling" };
  return { label: "Quiet", cls: "bg-free/12 text-[color-mix(in_oklch,var(--free),black_25%)] dark:text-free" };
}

export function DemandDashboard() {
  const geo = useGeolocation();
  const [area, setArea] = useState(PRESETS[0]);
  const [report, setReport] = useState<DemandReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (a: { name: string; lat: number; lng: number }) => {
    setArea(a);
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ report: DemandReport }>(`/api/ml/demand?lat=${a.lat}&lng=${a.lng}`);
      setReport(res.report);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetching the first forecast is this effect's purpose.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(PRESETS[0]);
  }, [load]);

  async function nearMe() {
    const pos = await geo.request();
    if (!pos) {
      toast.error("Couldn't get your location", { description: "Pick an area or search an address instead." });
      return;
    }
    void load({ name: "your location", lat: pos.lat, lng: pos.lng });
  }

  const next = report?.hourly[0];
  const peak = report ? [...report.hourly].sort((a, b) => b.occupancy_rate - a.occupancy_rate)[0] : null;
  const peakSet = new Set(report?.peak_hours.map((p) => p.ts));

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-soft">
        <div className="flex flex-col gap-2 sm:flex-row">
          <AddressSearch
            className="flex-1"
            placeholder="Forecast demand near an address (e.g. SFBU, Oracle Park)"
            proximity={geo.position}
            onSelect={(p) => void load({ name: p.name, lat: p.lat, lng: p.lng })}
          />
          <Button variant="outline" className="h-11" onClick={nearMe} loading={geo.status === "locating"}>
            <CrosshairIcon /> Near me
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              aria-pressed={area.name === p.name}
              onClick={() => void load(p)}
              className="rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-muted aria-pressed:border-teal-strong aria-pressed:bg-accent aria-pressed:text-accent-foreground"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-teal-strong/40 bg-accent/40 px-4 py-3 text-sm">
        <PredictedTag />
        <span>
          Everything on this page is a <strong>forecast</strong> for the next 24 hours around <strong>{area.name}</strong>. Confirmed counts appear as{" "}
          <em>Live</em> badges on the Find page.
        </span>
        {report?.demo_data && (
          <span className="inline-flex items-center gap-1 rounded-full bg-filling/15 px-2.5 py-0.5 text-xs font-semibold text-[color-mix(in_oklch,var(--filling),black_45%)] dark:text-filling">
            <AlertTriangleIcon className="size-3.5" aria-hidden /> Demonstration: model history is sample/prior data
          </span>
        )}
      </div>

      {error && (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-muted p-4 text-sm">
          <p>Couldn&apos;t load the forecast: {error}</p>
          <Button size="sm" variant="outline" onClick={() => void load(area)}>
            <RefreshCwIcon /> Retry
          </Button>
        </div>
      )}

      {loading && !report && <div className="h-80 animate-pulse rounded-2xl bg-muted" aria-label="Loading forecast" />}

      {report && report.sampled_locations === 0 && !loading && (
        <p className="rounded-xl bg-muted p-4 text-sm">No parking data for this area yet. Search it on the Find page first to load nearby parking.</p>
      )}

      {report && report.sampled_locations > 0 && (
        <div className={cn("space-y-6 transition-opacity", loading && "opacity-50")}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={LineChartIcon} label="Predicted demand now" value={next ? percent(next.occupancy_rate) : "–"} hint={next ? demandLevel(next.occupancy_rate).label : undefined} />
            <Kpi icon={FlameIcon} label="Next peak hour" value={peak ? time(peak.ts) : "–"} hint={peak ? `${percent(peak.occupancy_rate)} occupied` : undefined} />
            <Kpi icon={MoonIcon} label="Quietest hour" value={report.quietest ? time(report.quietest.ts) : "–"} hint={report.quietest ? `${percent(report.quietest.occupancy_rate)} occupied` : undefined} />
            <Kpi icon={SquareParkingIcon} label="Expected free spaces now" value={next ? `~${next.expected_free.toLocaleString()}` : "–"} hint={`of ${report.sampled_capacity.toLocaleString()} modelled`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border bg-card p-4 shadow-soft">
              <SeriesChart
                kind="area"
                title="Predicted parking demand, next 24 hours"
                valueLabel="Occupied"
                data={report.hourly.map((h) => ({ label: time(h.ts), value: Math.round(h.occupancy_rate * 100) }))}
                format={(v) => `${v}%`}
                yMax={100}
                height={220}
              />
            </div>
            <div className="rounded-2xl border bg-card p-4 shadow-soft">
              <SeriesChart
                title="Expected free spaces by hour (peak hours highlighted)"
                valueLabel="Free spaces"
                data={report.hourly.map((h) => ({ label: time(h.ts), value: h.expected_free, highlight: peakSet.has(h.ts) }))}
                height={220}
              />
            </div>
          </div>

          <section className="rounded-2xl border bg-card p-4 shadow-soft">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Busiest parking locations</h2>
              <p className="text-xs text-muted-foreground">Ranked by predicted peak occupancy · tap to see the place</p>
            </div>
            <ul className="divide-y">
              {report.busiest.map((l) => {
                const lvl = demandLevel(l.peak_rate);
                return (
                  <li key={l.id}>
                    <Link href={`/spots/${l.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:bg-muted/50 sm:flex-nowrap">
                      <MapPinIcon className="size-4 shrink-0 text-teal-strong" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{l.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {TYPE_LABEL[l.type]} · {l.total_spots} spaces · {money(l.hourly_price)}/hr{l.price_estimated ? " (est.)" : ""}
                        </p>
                      </div>
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", lvl.cls)}>{lvl.label}</span>
                      <span className="flex items-center gap-1 text-sm tabular-nums">
                        <ClockIcon className="size-3.5 text-muted-foreground" aria-hidden /> Peak {time(l.peak_ts)} · {percent(l.peak_rate)}
                      </span>
                      <span className="text-sm text-muted-foreground tabular-nums">~{l.free_at_peak} free at peak · quietest {time(l.quiet_ts)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border bg-card p-5 text-sm shadow-soft">
              <h2 className="mb-2 font-semibold">For drivers</h2>
              <p className="text-muted-foreground">
                {peak && report.quietest
                  ? `Demand around ${area.name} is expected to peak near ${time(peak.ts)}. Arriving closer to ${time(report.quietest.ts)} gives you the best odds of a free space. `
                  : ""}
                <Link href="/find" className="font-medium text-foreground underline underline-offset-4">
                  Find parking
                </Link>{" "}
                to see the predicted availability for your exact arrival time.
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-5 text-sm shadow-soft">
              <h2 className="mb-2 font-semibold">For parking owners</h2>
              <p className="text-muted-foreground">
                Busy hours are when a higher price still fills your spaces; quiet hours are when a lower price attracts drivers. Your{" "}
                <Link href="/host" className="font-medium text-foreground underline underline-offset-4">
                  host dashboard
                </Link>{" "}
                shows demand-based suggested prices and peak hours for each listing.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-5 text-sm shadow-soft">
            <h2 className="mb-2 font-semibold">How this prediction works (Traditional ML)</h2>
            <ul className="grid gap-2 text-muted-foreground sm:grid-cols-2">
              <li>• <strong className="text-foreground">Inputs:</strong> parking location and type, time of day, day of week, booking history and current demand.</li>
              <li>
                • <strong className="text-foreground">History:</strong> {report.history.observations.toLocaleString()} occupancy observations from the last 8 weeks for these places
                {report.history.sample_observations > 0 ? ` (${report.history.sample_observations.toLocaleString()} are labelled sample data)` : ""}.
              </li>
              <li>• <strong className="text-foreground">Model:</strong> a weekday × hour baseline per parking type, blended with observed history, then adjusted for ParkSmart bookings, nearby events and recent camera counts.</li>
              <li>• <strong className="text-foreground">Output:</strong> predicted occupancy, the chance a space is free on arrival, and expected free spaces. Sampled {report.sampled_locations} of the largest places nearby.</li>
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof ClockIcon; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <Icon className="size-5 text-teal-strong" aria-hidden />
        <PredictedTag label="Predicted" />
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {hint && <p className="mt-0.5 text-xs font-medium">{hint}</p>}
    </div>
  );
}
