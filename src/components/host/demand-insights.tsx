"use client";

import { FlameIcon, MoonIcon, RefreshCwIcon, TagIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { SeriesChart } from "@/components/charts/series-chart";
import { PredictedTag } from "@/components/parking/availability";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import { money, percent, time } from "@/lib/format";
import { demandPrice } from "@/lib/ml/demand-price";
import type { ForecastPoint } from "@/lib/types";

/**
 * Owner view of the ML demand forecast for one listing: peak and quiet hours,
 * plus a demand-based suggested price for each hour of the next day.
 */
export function HostDemandInsights({ locationId, timezone, currentPrice }: { locationId: string; timezone: string; currentPrice: number }) {
  const [points, setPoints] = useState<ForecastPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<{ points: ForecastPoint[] }>(`/api/locations/${locationId}/forecast`)
      .then((r) => !cancelled && setPoints(r.points))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [locationId, attempt]);

  if (error)
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl bg-muted p-4 text-sm">
        <p>Couldn&apos;t load demand insights: {error}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setError(null);
            setPoints(null);
            setAttempt((a) => a + 1);
          }}
        >
          <RefreshCwIcon /> Retry
        </Button>
      </div>
    );
  if (!points) return <div className="h-64 animate-pulse rounded-xl bg-muted" aria-label="Loading demand insights" />;
  if (points.length === 0) return <p className="text-sm text-muted-foreground">No forecast available yet.</p>;

  const sorted = [...points].sort((a, b) => b.occupancy_rate - a.occupancy_rate);
  const peaks = sorted.slice(0, 3).sort((a, b) => a.ts.localeCompare(b.ts));
  const quiet = sorted.slice(-3).sort((a, b) => a.ts.localeCompare(b.ts));
  const peakPrice = demandPrice(currentPrice, sorted[0].occupancy_rate);
  const quietPrice = demandPrice(currentPrice, sorted[sorted.length - 1].occupancy_rate);
  const avgRate = points.reduce((s, p) => s + p.occupancy_rate, 0) / points.length;
  const dayPrice = demandPrice(currentPrice, avgRate);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <PredictedTag />
        <span>Forecast for the next 24 hours. Suggested prices scale your current {money(currentPrice)}/hr with predicted demand (−25% to +35%).</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile icon={FlameIcon} title="Peak demand hours" value={peaks.map((p) => time(p.ts, timezone)).join(", ")} hint={`Up to ${percent(sorted[0].occupancy_rate)} occupied`} />
        <Tile icon={MoonIcon} title="Quietest hours" value={quiet.map((p) => time(p.ts, timezone)).join(", ")} hint={`Down to ${percent(sorted[sorted.length - 1].occupancy_rate)} occupied`} />
        <Tile
          icon={TagIcon}
          title="Suggested prices"
          value={`${money(peakPrice)} peak · ${money(quietPrice)} quiet`}
          hint={`All-day average suggestion: ${money(dayPrice)}/hr`}
        />
      </div>
      <SeriesChart
        title="Demand-based suggested price by hour"
        valueLabel="Suggested $/hr"
        data={points.map((p) => ({ label: time(p.ts, timezone), value: demandPrice(currentPrice, p.occupancy_rate), highlight: peaks.some((x) => x.ts === p.ts) }))}
        format={(v) => `$${v.toFixed(2)}`}
        height={200}
      />
      <p className="text-xs text-muted-foreground">
        For a price that also weighs nearby competitors and amenities, use the <strong>AI pricing</strong> tab.
      </p>
    </div>
  );
}

function Tile({ icon: Icon, title, value, hint }: { icon: typeof TagIcon; title: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-soft">
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Icon className="size-4 text-teal-strong" aria-hidden /> {title}
      </p>
      <p className="mt-1 font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
