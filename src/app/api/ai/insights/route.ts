import { z } from "zod";
import { ApiError, handler, ok, parseJson, requireUser } from "@/lib/api";
import { DEMO_REVIEWS, summarizeFeedbackRules, type FeedbackInput, type FeedbackSummary } from "@/lib/ai/feedback";
import { getOpenAI, models, structured } from "@/lib/ai/openai";
import { serverEnv } from "@/lib/env";
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
  availability_trend?: string;
  feedback?: FeedbackSummary;
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

  // Customer feedback from the last 7 days; labelled demo reviews if there are none yet.
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: reviewRows } = await supabase
    .from("reviews")
    .select("rating, comment, location:parking_locations(name)")
    .gte("created_at", since)
    .limit(200);
  const real: FeedbackInput[] = ((reviewRows ?? []) as unknown as { rating: number; comment: string | null; location: { name: string } | null }[]).map((r) => ({
    rating: r.rating,
    comment: r.comment,
    location_name: r.location?.name ?? null,
  }));
  const feedbackInput = real.length ? real : DEMO_REVIEWS;
  const feedback = summarizeFeedbackRules(feedbackInput, real.length === 0);

  let summary: InsightSummary;
  let model = "rules";
  if (getOpenAI()) {
    const ai = await structured<InsightSummary & { feedback_highlights: string }>({
      name: "daily_insights",
      system:
        "You are the operations analyst for ParkSmart, a San Francisco parking marketplace. Write a concise daily briefing for admins " +
        "from the metrics JSON. Use only the numbers provided; if data is sparse, say so plainly instead of guessing. " +
        "Flag anomalies such as no-shows, abandoned checkouts, cancellation spikes, or revenue drops versus the 14-day trend. Hours are local (America/Los_Angeles). " +
        "availability_trend: describe how occupancy changes over the day from occupancy_by_hour. " +
        "feedback_highlights: 2-3 sentences summarizing customer_reviews (what drivers like, main complaints, one improvement); if reviews_are_demo_data is true, start with 'Demo reviews:'.",
      user: JSON.stringify({ metrics, customer_reviews: feedbackInput.slice(0, 60), reviews_are_demo_data: real.length === 0 }),
      maxTokens: 1200,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "peak_hours", "busiest_lots", "revenue_trend", "availability_trend", "feedback_highlights", "anomalies", "recommendations"],
        properties: {
          availability_trend: { type: "string" },
          feedback_highlights: { type: "string" },
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
    const { feedback_highlights, ...rest } = ai;
    summary = { ...rest, feedback: { ...feedback, summary: feedback_highlights, model } };
  } else {
    summary = { ...ruleSummary(metrics), feedback };
  }

  const row = { for_date: metrics.day, summary: { ...summary, metrics }, model, created_by: profile.id };
  // Saving needs the service-role key; without it the report is still returned, just not stored.
  if (!serverEnv().supabaseServiceRoleKey) {
    return ok({ insight: { ...row, id: "unsaved", created_at: new Date().toISOString() } });
  }
  const { data: saved, error: saveError } = await createAdminClient().from("ai_insights").insert(row).select("*").single();
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
    availability_trend: availabilityTrend(m.occupancy_by_hour),
    anomalies,
    recommendations: ["Add OPENAI_API_KEY to get AI-written recommendations."],
  };
}

function availabilityTrend(rows: { hour: number; rate: number }[]) {
  const pts = rows.filter((r) => r.rate !== null);
  if (pts.length < 2) return "Not enough occupancy data for a trend yet.";
  const max = pts.reduce((a, b) => (Number(b.rate) > Number(a.rate) ? b : a));
  const min = pts.reduce((a, b) => (Number(b.rate) < Number(a.rate) ? b : a));
  return `Fullest around ${max.hour}:00 (${Math.round(Number(max.rate) * 100)}% occupied); most space around ${min.hour}:00 (${Math.round(Number(min.rate) * 100)}% occupied).`;
}
