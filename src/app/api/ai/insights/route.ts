import { z } from "zod";
import { ApiError, handler, ok, parseJson, requireUser } from "@/lib/api";
import { getOpenAI, models, structured } from "@/lib/ai/openai";
import { createAdminClient } from "@/lib/supabase/server";

interface Metrics {
  day: string;
  bookings: number;
  cancelled: number;
  revenue: number;
  no_shows: number;
  abandoned_checkouts: number;
  bookings_by_hour: { hour: number; count: number }[];
  busiest_locations: { id: string; name: string; bookings: number; revenue: number }[];
  revenue_trend: { day: string; revenue: number }[];
  occupancy_by_hour: { hour: number; rate: number }[];
  cv_detections: number;
  new_users: number;
}

export interface InsightSummary {
  headline: string;
  peak_hours: string;
  busiest_lots: string[];
  revenue_trend: string;
  anomalies: { title: string; detail: string; severity: "info" | "warning" | "critical" }[];
  recommendations: string[];
}

const dayFormat = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const GET = handler(async (req: Request) => {
  const { supabase } = await requireUser(["admin"]);
  const day = new URL(req.url).searchParams.get("day");
  let query = supabase.from("ai_insights").select("*").order("created_at", { ascending: false }).limit(1);
  if (day && dayFormat.safeParse(day).success) query = query.eq("for_date", day);
  const { data } = await query.maybeSingle();
  return ok({ insight: data });
});

/** Generates the AI daily summary from aggregated, real metrics. */
export const POST = handler(async (req: Request) => {
  const { day } = await parseJson(req, z.object({ day: dayFormat.optional() }));
  const { supabase, profile } = await requireUser(["admin"]);
  const { data, error } = await supabase.rpc("admin_daily_metrics", day ? { p_day: day } : {});
  if (error) throw new ApiError(500, "Could not load metrics");
  const metrics = data as Metrics;

  let summary: InsightSummary;
  let model = "rules";
  if (getOpenAI()) {
    summary = await structured<InsightSummary>({
      name: "daily_insights",
      system:
        "You are the operations analyst for ParkSmart, a San Francisco parking marketplace. Write a concise daily briefing for admins " +
        "from the metrics JSON. Use only the numbers provided; if data is sparse, say so plainly instead of guessing. " +
        "Flag anomalies such as no-shows, abandoned checkouts, cancellation spikes, or revenue drops versus the 14-day trend. Hours are local (America/Los_Angeles).",
      user: JSON.stringify(metrics),
      maxTokens: 900,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "peak_hours", "busiest_lots", "revenue_trend", "anomalies", "recommendations"],
        properties: {
          headline: { type: "string" },
          peak_hours: { type: "string" },
          busiest_lots: { type: "array", items: { type: "string" } },
          revenue_trend: { type: "string" },
          anomalies: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "detail", "severity"],
              properties: {
                title: { type: "string" },
                detail: { type: "string" },
                severity: { type: "string", enum: ["info", "warning", "critical"] },
              },
            },
          },
          recommendations: { type: "array", items: { type: "string" } },
        },
      },
    });
    model = models().text;
  } else {
    summary = ruleSummary(metrics);
  }

  const { data: saved, error: saveError } = await createAdminClient()
    .from("ai_insights")
    .insert({ for_date: metrics.day, summary: { ...summary, metrics }, model, created_by: profile.id })
    .select("*")
    .single();
  if (saveError) throw new ApiError(500, "Could not save insights");
  return ok({ insight: saved });
});

function ruleSummary(m: Metrics): InsightSummary {
  const peak = [...m.bookings_by_hour].sort((a, b) => b.count - a.count)[0];
  const trend = m.revenue_trend;
  const prior = trend.slice(0, -1);
  const avg = prior.length ? prior.reduce((s, d) => s + Number(d.revenue), 0) / prior.length : 0;
  const anomalies: InsightSummary["anomalies"] = [];
  if (m.no_shows > 0) anomalies.push({ title: `${m.no_shows} no-show${m.no_shows > 1 ? "s" : ""}`, detail: "Paid bookings ended without a check-in.", severity: m.no_shows >= 3 ? "warning" : "info" });
  if (m.abandoned_checkouts > 0) anomalies.push({ title: `${m.abandoned_checkouts} abandoned checkout${m.abandoned_checkouts > 1 ? "s" : ""}`, detail: "Holds expired before payment.", severity: m.abandoned_checkouts >= 5 ? "warning" : "info" });
  if (m.bookings > 0 && m.cancelled / m.bookings > 0.3) anomalies.push({ title: "High cancellation rate", detail: `${m.cancelled} of ${m.bookings} bookings were cancelled.`, severity: "warning" });
  return {
    headline: m.bookings ? `${m.bookings} bookings and $${Number(m.revenue).toFixed(2)} revenue on ${m.day}.` : `No paid bookings yet on ${m.day}.`,
    peak_hours: peak ? `Busiest start hour: ${peak.hour}:00 (${peak.count} bookings).` : "Not enough bookings to find a peak.",
    busiest_lots: m.busiest_locations.map((l) => `${l.name} — ${l.bookings} bookings`),
    revenue_trend: prior.length ? `Today $${Number(m.revenue).toFixed(2)} vs. ${prior.length}-day average $${avg.toFixed(2)}.` : "Not enough history for a trend yet.",
    anomalies,
    recommendations: ["Add OPENAI_API_KEY to get AI-written recommendations."],
  };
}
