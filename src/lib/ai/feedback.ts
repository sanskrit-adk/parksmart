import "server-only";

import { getOpenAI, models, structured } from "@/lib/ai/openai";

export interface FeedbackInput {
  rating: number;
  comment: string | null;
  location: string | null;
  created_at: string;
}

export interface FeedbackSummary {
  overview: string;
  sentiment: "positive" | "mixed" | "negative";
  average_rating: number;
  review_count: number;
  positives: string[];
  issues: string[];
  suggestions: string[];
  highlights: string[];
}

export interface FeedbackResult {
  summary: FeedbackSummary;
  engine: string;
  /** True when no (or too few) real reviews exist and the sample set was used. */
  sample: boolean;
}

/**
 * Clearly-labelled demonstration feedback, used only when there are fewer
 * than three real reviews, so the feature can be shown end to end.
 */
export const SAMPLE_FEEDBACK: FeedbackInput[] = [
  { rating: 5, comment: "Space was free exactly like the app predicted. Easy entrance and QR check-in worked first time.", location: "Sample: Mission St Garage", created_at: "" },
  { rating: 4, comment: "Good price for downtown, but the signage to the ParkSmart bays was hard to find.", location: "Sample: Mission St Garage", created_at: "" },
  { rating: 2, comment: "Arrived at 6pm and the lot was nearly full. Took ten minutes to find my space.", location: "Sample: 5th & Market Lot", created_at: "" },
  { rating: 5, comment: "Love the EV charger and the covered level. Felt safe and clean.", location: "Sample: Union Square Garage", created_at: "" },
  { rating: 3, comment: "Walk was longer than shown and the lighting at night could be better.", location: "Sample: 5th & Market Lot", created_at: "" },
  { rating: 4, comment: "Booking and payment were quick. Would like a cheaper evening rate.", location: "Sample: Union Square Garage", created_at: "" },
  { rating: 1, comment: "Gate attendant did not know about my reservation, had to show the QR code twice.", location: "Sample: 5th & Market Lot", created_at: "" },
];

const THEMES: { key: string; words: RegExp; good: string; bad: string; fix: string }[] = [
  { key: "availability", words: /\b(full|free|space|spot|available|predict)/i, good: "Spaces were available as predicted", bad: "Lots filling up at busy times", fix: "Raise peak prices or add capacity at busy hours; keep predictions conservative." },
  { key: "price", words: /\b(price|cheap|expensive|rate|cost|\$)/i, good: "Prices seen as fair", bad: "Price concerns", fix: "Offer an off-peak or evening rate." },
  { key: "access", words: /\b(gate|entrance|attendant|qr|check-?in|sign|signage|find)/i, good: "Smooth entry and check-in", bad: "Entry, signage or staff confusion", fix: "Improve signage and brief on-site staff about ParkSmart reservations." },
  { key: "safety", words: /\b(safe|clean|light|lighting|dark|dirty)/i, good: "Clean and feels safe", bad: "Cleanliness or lighting concerns", fix: "Improve lighting and cleaning schedules." },
  { key: "walk", words: /\b(walk|far|distance|close)/i, good: "Convenient location", bad: "Walking distance longer than expected", fix: "Show clearer walking routes and set accurate pins." },
  { key: "amenities", words: /\b(ev|charger|covered|accessible)/i, good: "Amenities (EV, covered) appreciated", bad: "Amenity problems", fix: "Keep amenity listings accurate and maintained." },
  { key: "app", words: /\b(app|booking|payment|pay|quick|easy)/i, good: "Booking and payment are easy", bad: "Booking or payment friction", fix: "Review the booking flow for the reported issues." },
];

export async function summarizeFeedback(reviews: FeedbackInput[], scope: string): Promise<FeedbackResult> {
  const real = reviews.filter((r) => r.comment && r.comment.trim().length > 0);
  const sample = real.length < 3;
  const data = sample ? SAMPLE_FEEDBACK : real.slice(0, 150);
  const avg = Math.round((data.reduce((s, r) => s + r.rating, 0) / data.length) * 10) / 10;

  if (getOpenAI()) {
    try {
      const summary = await structured<Omit<FeedbackSummary, "average_rating" | "review_count">>({
        name: "feedback_summary",
        system:
          "You summarise customer reviews for ParkSmart, a San Francisco parking marketplace, so operators can improve their service. " +
          "Use only what the reviews say. Group repeated points into themes, keep each bullet under 20 words, and make suggestions concrete and actionable. " +
          "Highlights are short paraphrases (not verbatim quotes) of the most useful individual comments.",
        user: JSON.stringify({ scope, average_rating: avg, reviews: data.map((r) => ({ rating: r.rating, comment: r.comment, location: r.location })) }),
        maxTokens: 700,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["overview", "sentiment", "positives", "issues", "suggestions", "highlights"],
          properties: {
            overview: { type: "string" },
            sentiment: { type: "string", enum: ["positive", "mixed", "negative"] },
            positives: { type: "array", items: { type: "string" } },
            issues: { type: "array", items: { type: "string" } },
            suggestions: { type: "array", items: { type: "string" } },
            highlights: { type: "array", items: { type: "string" } },
          },
        },
      });
      return { summary: { ...summary, average_rating: avg, review_count: data.length }, engine: models().text, sample };
    } catch {
      /* fall through to the rule-based summary */
    }
  }
  return { summary: ruleSummary(data, avg), engine: "rules", sample };
}

/** Keyword-theme summary used when no LLM is configured. */
function ruleSummary(data: FeedbackInput[], avg: number): FeedbackSummary {
  const good = new Map<string, number>();
  const bad = new Map<string, number>();
  for (const r of data) {
    for (const t of THEMES) {
      if (!r.comment || !t.words.test(r.comment)) continue;
      const bucket = r.rating >= 4 ? good : r.rating <= 3 ? bad : null;
      bucket?.set(t.key, (bucket.get(t.key) ?? 0) + 1);
    }
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const positives = top(good).map(([k, n]) => `${THEMES.find((t) => t.key === k)!.good} (${n} mention${n > 1 ? "s" : ""})`);
  const issueKeys = top(bad);
  const issues = issueKeys.map(([k, n]) => `${THEMES.find((t) => t.key === k)!.bad} (${n} mention${n > 1 ? "s" : ""})`);
  const suggestions = issueKeys.map(([k]) => THEMES.find((t) => t.key === k)!.fix);
  const lowShare = data.filter((r) => r.rating <= 2).length / data.length;
  const sentiment: FeedbackSummary["sentiment"] = avg >= 4 && lowShare < 0.15 ? "positive" : avg < 3 ? "negative" : "mixed";
  const pick = (rows: FeedbackInput[]) => rows.map((r) => `${r.rating}★: ${truncate(r.comment ?? "", 110)}`);
  return {
    overview: `${data.length} reviews with an average of ${avg.toFixed(1)}★. ${positives[0] ? `Drivers most often praise: ${positives[0].replace(/ \(.*\)$/, "").toLowerCase()}.` : ""} ${issues[0] ? `Main complaint: ${issues[0].replace(/ \(.*\)$/, "").toLowerCase()}.` : ""}`.trim(),
    sentiment,
    average_rating: avg,
    review_count: data.length,
    positives,
    issues,
    suggestions: suggestions.length ? suggestions : ["Keep doing what works; ask drivers for more detailed feedback."],
    highlights: [...pick(data.filter((r) => r.rating >= 4).slice(0, 2)), ...pick(data.filter((r) => r.rating <= 2).slice(0, 2))],
  };
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
