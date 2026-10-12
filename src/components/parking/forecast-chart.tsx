"use client";

import { RefreshCwIcon, SparklesIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { SeriesChart } from "@/components/charts/series-chart";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import { percent, time } from "@/lib/format";
import type { ForecastPoint } from "@/lib/types";

/** 24-hour occupancy forecast with the AI's "best time to arrive". */
export function ForecastChart({ locationId, timezone }: { locationId: string; timezone: string }) {
  const [points, setPoints] = useState<ForecastPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<{ points: ForecastPoint[] }>(`/api/locations/${locationId}/forecast`)
      .then((res) => !cancelled && setPoints(res.points))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [locationId, attempt]);

  function load() {
    setError(null);
    setPoints(null);
    setAttempt((a) => a + 1);
  }

  if (error) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl bg-muted p-4 text-sm">
        <p>Couldn&apos;t load the forecast: {error}</p>
        <Button size="sm" variant="outline" onClick={load}>
          <RefreshCwIcon /> Retry
        </Button>
      </div>
    );
  }
  if (!points) return <div className="h-[244px] animate-pulse rounded-xl bg-muted" aria-label="Loading forecast" />;

  const next12 = points.slice(0, 12);
  const best = next12.reduce((a, b) => (b.free_probability > a.free_probability ? b : a), next12[0]);
  const data = points.map((p) => ({ label: time(p.ts, timezone), value: Math.round(p.occupancy_rate * 100), highlight: p.ts === best?.ts }));

  return (
    <div className="space-y-3">
      {best && (
        <p className="flex items-start gap-2 rounded-xl bg-accent/70 px-3 py-2 text-sm text-accent-foreground">
          <SparklesIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Best time in the next 12 hours: <strong>{time(best.ts, timezone)}</strong>, {percent(best.free_probability)} chance a space is free.
          </span>
        </p>
      )}
      <SeriesChart title="Predicted occupancy, next 24 hours" valueLabel="Occupied" data={data} format={(v) => `${v}%`} yMax={100} />
    </div>
  );
}
