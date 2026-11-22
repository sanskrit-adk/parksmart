"use client";

import { InfoIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SeriesChart } from "@/components/charts/series-chart";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import { percent, time } from "@/lib/format";
import type { SpotForecastPoint, SpotPrediction, SpotPredictionBasis } from "@/lib/types";
import { cn } from "@/lib/utils";

const BASIS_LABEL: Record<SpotPredictionBasis, string> = {
  booked: "Booked through ParkSmart",
  live: "Based on live status",
  history: "Based on this space's history",
  location: "No history for this space yet; using the lot forecast",
};

function tone(p: number) {
  if (p >= 0.6) return "bg-free/85 text-white";
  if (p >= 0.3) return "bg-filling/85 text-black";
  return "bg-full/85 text-white";
}

/** Per-space "chance free at arrival" grid with an arrival-time slider. */
export function SpotGrid({ locationId, timezone }: { locationId: string; timezone: string }) {
  const [offset, setOffset] = useState(0); // hours from now
  const [spots, setSpots] = useState<SpotPrediction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<SpotPrediction | null>(null);

  const at = useMemo(() => {
    const d = new Date();
    if (offset > 0) d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + offset);
    return d.toISOString();
  }, [offset]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      api<{ spots: SpotPrediction[] }>(`/api/locations/${locationId}/spots?at=${encodeURIComponent(at)}`)
        .then((res) => {
          if (cancelled) return;
          setError(null);
          setSpots(res.spots);
        })
        .catch((e: Error) => !cancelled && setError(e.message));
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [locationId, at, attempt]);

  if (error) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl bg-muted p-4 text-sm">
        <p>Couldn&apos;t load space predictions: {error}</p>
        <Button size="sm" variant="outline" onClick={() => setAttempt((a) => a + 1)}>
          <RefreshCwIcon /> Retry
        </Button>
      </div>
    );
  }
  if (!spots) return <div className="h-40 animate-pulse rounded-xl bg-muted" aria-label="Loading spaces" />;
  if (spots.length === 0) return null;

  const sample = spots.some((s) => s.is_sample);
  const best = spots.reduce((a, b) => (b.free_probability > a.free_probability ? b : a), spots[0]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="arrive" className="flex justify-between text-sm font-medium">
          <span>Arriving</span>
          <span className="text-teal-strong">{offset === 0 ? "Now" : `${time(at, timezone)} (+${offset}h)`}</span>
        </label>
        <input
          id="arrive"
          type="range"
          min={0}
          max={23}
          value={offset}
          onChange={(e) => setOffset(Number(e.target.value))}
          className="mt-2 w-full accent-[var(--teal-strong,currentColor)]"
        />
      </div>

      <p className="text-sm">
        Best space: <strong>{best.label}</strong>, {percent(best.free_probability)} chance it&apos;s free
        {sample && <span className="text-muted-foreground"> (est.)</span>}
      </p>

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(3.75rem,1fr))] gap-2" aria-label="Spaces and their chance of being free">
        {spots.map((s) => (
          <li key={s.spot_id}>
            <button
              type="button"
              onClick={() => setSelected(selected?.spot_id === s.spot_id ? null : s)}
              aria-pressed={selected?.spot_id === s.spot_id}
              title={`${s.label}: ${percent(s.free_probability)} free. ${BASIS_LABEL[s.basis]}`}
              className={cn(
                "flex h-14 w-full flex-col items-center justify-center rounded-lg text-xs font-semibold transition",
                tone(s.free_probability),
                s.basis === "location" && "opacity-70",
                selected?.spot_id === s.spot_id && "ring-2 ring-foreground ring-offset-2",
              )}
            >
              <span>{s.label}</span>
              <span className="font-normal">{Math.round(s.free_probability * 100)}%</span>
            </button>
          </li>
        ))}
      </ul>

      <p className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-free" /> likely free</span>
        <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-filling" /> maybe</span>
        <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-full" /> likely taken</span>
      </p>

      {sample && (
        <p className="flex gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
          <InfoIcon className="size-4 shrink-0" aria-hidden />
          Space-level history here is synthetic sample data, so these percentages are estimates for demonstration.
        </p>
      )}

      {selected && <SpotForecast key={selected.spot_id} spot={selected} timezone={timezone} />}
    </div>
  );
}

function SpotForecast({ spot, timezone }: { spot: SpotPrediction; timezone: string }) {
  const [points, setPoints] = useState<SpotForecastPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ points: SpotForecastPoint[] }>(`/api/spots/${spot.spot_id}/forecast`)
      .then((r) => !cancelled && setPoints(r.points))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [spot.spot_id]);

  if (error) return <p className="text-sm text-muted-foreground">Couldn&apos;t load the forecast for {spot.label}: {error}</p>;
  if (!points) return <div className="h-[244px] animate-pulse rounded-xl bg-muted" />;

  return (
    <div className="rounded-xl border p-3">
      <p className="mb-1 text-xs text-muted-foreground">{BASIS_LABEL[spot.basis]} · {spot.history_n} past observations at this hour</p>
      <SeriesChart
        title={`Space ${spot.label}: chance free, next 24 hours`}
        valueLabel="Free"
        data={points.map((p) => ({ label: time(p.ts, timezone), value: Math.round(p.free_probability * 100) }))}
        format={(v) => `${v}%`}
        yMax={100}
      />
    </div>
  );
}
