"use client";

import { SparklesIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { AiPickBadge } from "@/components/parking/availability";
import { api } from "@/lib/fetcher";
import { money, percent } from "@/lib/format";
import type { RankedLocation } from "@/lib/types";

function facts(r: RankedLocation) {
  return {
    name: r.name,
    hourly_price: r.hourly_price,
    walk_minutes: r.walk_minutes,
    predicted_availability: r.free_probability,
    predicted_free_spaces: r.predicted_free_spaces,
    covered: r.covered,
    ev_charging: r.ev_charging,
    accessible: r.accessible,
    estimated_total: r.estimated_total,
    availability_mode: r.availability_mode,
  };
}

/**
 * Highlights the AI Pick at the top of the results with a Generative-AI
 * explanation of why it beats the alternatives (template fallback).
 */
export function RecommendationExplainer({
  results,
  request,
  destination,
  durationHours,
  onShow,
}: {
  results: RankedLocation[];
  request: string | null;
  destination: string | null;
  durationHours: number;
  onShow: (id: string) => void;
}) {
  const pick = results.find((r) => r.ai_pick);
  const [state, setState] = useState<{ key: string; text: string; engine: string } | null>(null);
  const key = pick ? `${pick.id}|${request ?? ""}|${durationHours}` : "";

  useEffect(() => {
    if (!pick) return;
    let cancelled = false;
    const alternatives = results.filter((r) => r.id !== pick.id).slice(0, 3).map(facts);
    api<{ explanation: string; engine: string }>("/api/ai/explain", {
      json: { pick: facts(pick), alternatives, template: pick.explanation, request, destination, duration_hours: durationHours },
    })
      .then((res) => !cancelled && setState({ key, text: res.explanation, engine: res.engine }))
      .catch(() => !cancelled && setState({ key, text: pick.explanation, engine: "template" }));
    return () => {
      cancelled = true;
    };
    // Only re-explain when the pick or the request changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!pick) return null;
  const current = state?.key === key ? state : null;

  return (
    <section aria-label="Recommended parking" className="rounded-2xl border border-teal/60 bg-gradient-to-br from-accent/80 to-card p-4 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <AiPickBadge />
        <button type="button" onClick={() => onShow(pick.id)} className="truncate font-semibold hover:underline">
          {pick.name}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {money(pick.hourly_price)}/hr · {pick.walk_minutes}-min walk · {percent(pick.free_probability)} predicted availability · ~{pick.predicted_free_spaces} spaces expected free
      </p>
      <p className="mt-2 text-sm leading-relaxed" aria-live="polite">
        {current ? current.text : <span className="inline-block h-4 w-4/5 animate-pulse rounded bg-muted align-middle" />}
      </p>
      {current && (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <SparklesIcon className="size-3" aria-hidden />
          {current.engine === "template" ? "Explanation built from the ranking model's factors" : `Explanation written by Generative AI (${current.engine}) from the ranking model's facts`}
        </p>
      )}
    </section>
  );
}
