"use client";

import { CheckIcon, RefreshCwIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import { distance, money } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Suggestion {
  suggested_price: number;
  range_low: number;
  range_high: number;
  peak_price: number;
  off_peak_price: number;
  peak_hours: string;
  confidence: "low" | "medium" | "high";
  reasons: string[];
  comparables: { name: string; price: number; distance_m: number; estimated: boolean }[];
  engine: "ai" | "rules";
}

export type PriceRequest =
  | { location_id: string }
  | { lat: number; lng: number; type: "garage" | "lot" | "private"; covered: boolean; ev_charging: boolean; total_spots: number; current_price?: number | null };

/** Dynamic pricing suggestion with a one-tap "Apply suggestion". */
export function PriceSuggestion({
  request,
  currentPrice,
  onApply,
  className,
}: {
  request: PriceRequest;
  currentPrice: number | null;
  onApply: (price: number) => Promise<void> | void;
  className?: string;
}) {
  const [data, setData] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await api<Suggestion>("/api/ai/price-suggestion", { json: request }));
    } catch (e) {
      setError((e as Error).message);
      toast.error("Couldn't get a price suggestion", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    if (!data) return;
    setApplying(true);
    try {
      await onApply(data.suggested_price);
    } finally {
      setApplying(false);
    }
  }

  const applied = data && currentPrice !== null && Math.abs(currentPrice - data.suggested_price) < 0.01;

  return (
    <div className={cn("rounded-2xl border-2 border-teal/40 bg-accent/30 p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            <SparklesIcon className="size-4 text-teal-strong" /> AI price suggestion
          </p>
          <p className="text-sm text-muted-foreground">Based on nearby prices, local demand and time of day.</p>
        </div>
        {data && (
          <Button variant="ghost" size="icon-sm" onClick={load} loading={loading} aria-label="Refresh suggestion">
            <RefreshCwIcon />
          </Button>
        )}
      </div>

      {!data ? (
        <div className="mt-4">
          <Button variant="teal" onClick={load} loading={loading}>
            <SparklesIcon /> Suggest a price
          </Button>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <p className="text-4xl font-extrabold">
              {money(data.suggested_price)}
              <span className="text-base font-medium text-muted-foreground">/hr</span>
            </p>
            <div className="text-sm text-muted-foreground">
              <p>
                Range {money(data.range_low)}–{money(data.range_high)} · {data.confidence} confidence
              </p>
              <p>
                Peak ({data.peak_hours}) {money(data.peak_price)} · off-peak {money(data.off_peak_price)}
              </p>
            </div>
          </div>
          <ul className="space-y-1.5 text-sm">
            {data.reasons.map((r) => (
              <li key={r} className="flex gap-2">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-teal-strong" aria-hidden /> {r}
              </li>
            ))}
          </ul>
          {data.comparables.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-teal-strong">Nearby prices compared ({data.comparables.length})</summary>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {data.comparables.map((c) => (
                  <li key={c.name + c.distance_m} className="flex justify-between gap-2">
                    <span className="truncate">
                      {c.name} · {distance(c.distance_m)}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {c.estimated ? "~" : ""}
                      {money(c.price)}/hr
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={apply} loading={applying} disabled={Boolean(applied)}>
              {applied ? (
                <>
                  <CheckIcon /> Applied
                </>
              ) : (
                `Apply ${money(data.suggested_price)}/hr`
              )}
            </Button>
            <span className="text-xs text-muted-foreground">{data.engine === "ai" ? "Reasoned by AI from the data above" : "Rule-based estimate (AI key not configured)"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
