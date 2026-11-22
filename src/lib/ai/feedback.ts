/**
 * Customer feedback summarization.
 *
 * `summarizeFeedbackRules` is a deterministic theme extractor (keyword matching
 * over review text + star ratings). The insights route can pass the same
 * reviews to the LLM for a written summary; this module stays dependency-free
 * so it also runs on server pages without an OpenAI key.
 *
 * When a location has no real reviews, callers may use `DEMO_REVIEWS`. They are
 * synthetic, and every summary built from them has `sample: true` so the UI can
 * label it "Demo data".
 */

export interface FeedbackInput {
  rating: number;
  comment: string | null;
  location_name?: string | null;
}

export interface FeedbackSummary {
  count: number;
  average: number | null;
  sentiment: "positive" | "mixed" | "negative" | "none";
  summary: string;
  positives: string[];
  issues: string[];
  suggestions: string[];
  model: string;
  sample: boolean;
}

interface Theme {
  key: string;
  positive: string;
  negative: string;
  suggestion: string;
  words: RegExp;
}

const THEMES: Theme[] = [
  { key: "price", positive: "Good value for the price", negative: "Price feels too high", suggestion: "Offer off-peak or early-bird discounts.", words: /\b(price|cheap|expensive|pricey|value|cost|afford|overpriced|rate)\w*/i },
  { key: "location", positive: "Convenient location, short walk", negative: "Location or walk is inconvenient", suggestion: "Improve walking directions from the entrance.", words: /\b(close|near|walk|location|convenient|far|distance)\w*/i },
  { key: "availability", positive: "Space was available on arrival", negative: "Hard to find a free space", suggestion: "Hold more app-bookable spaces at peak hours.", words: /\b(available|availability|space|spot|full|free|empty|found)\w*/i },
  { key: "access", positive: "Easy entry and check-in", negative: "Entry, signage or check-in is confusing", suggestion: "Add clearer signs and entry instructions.", words: /\b(entry|entrance|gate|sign|signage|check-?in|confus|find|easy|qr)\w*/i },
  { key: "safety", positive: "Feels safe and well lit", negative: "Safety or lighting concerns", suggestion: "Improve lighting and add security patrols or cameras.", words: /\b(safe|safety|secure|light|lit|dark|sketchy|security)\w*/i },
  { key: "clean", positive: "Clean and well maintained", negative: "Cleanliness or maintenance issues", suggestion: "Schedule more frequent cleaning.", words: /\b(clean|dirty|trash|maint|smell|tidy)\w*/i },
  { key: "ev", positive: "EV chargers worked well", negative: "EV chargers broken or busy", suggestion: "Check EV chargers daily and add more ports.", words: /\b(ev|charger|charging)\b/i },
  { key: "size", positive: "Roomy spaces", negative: "Tight spaces or ramps", suggestion: "Mark compact spaces clearly.", words: /\b(tight|narrow|small|roomy|wide|ramp|compact)\w*/i },
];

const NEGATIVE = /\b(not|no|never|hard|difficult|bad|poor|broken|dirty|dark|expensive|overpriced|pricey|confus|full|far|tight|narrow|sketchy|slow|rude|smell|late|wrong)\w*/i;

function splitSentences(text: string) {
  return text.split(/(?<=[.!?])\s+|\s+but\s+|;\s*/i).map((s) => s.trim()).filter(Boolean);
}

export function summarizeFeedbackRules(reviews: FeedbackInput[], sample = false): FeedbackSummary {
  if (reviews.length === 0) {
    return { count: 0, average: null, sentiment: "none", summary: "No customer feedback yet.", positives: [], issues: [], suggestions: [], model: "rules", sample };
  }
  const average = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  const pos = new Map<string, number>();
  const neg = new Map<string, number>();

  for (const r of reviews) {
    for (const sentence of splitSentences(r.comment ?? "")) {
      const negative = NEGATIVE.test(sentence) || r.rating <= 2;
      for (const t of THEMES) {
        if (!t.words.test(sentence)) continue;
        const map = negative ? neg : pos;
        map.set(t.key, (map.get(t.key) ?? 0) + 1);
      }
    }
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const theme = (k: string) => THEMES.find((t) => t.key === k)!;
  const positives = top(pos).map(([k, n]) => `${theme(k).positive} (${n} mention${n > 1 ? "s" : ""})`);
  const issueKeys = top(neg);
  const issues = issueKeys.map(([k, n]) => `${theme(k).negative} (${n} mention${n > 1 ? "s" : ""})`);
  const suggestions = issueKeys.map(([k]) => theme(k).suggestion);

  const lowShare = reviews.filter((r) => r.rating <= 2).length / reviews.length;
  const sentiment = average >= 4 && lowShare < 0.2 ? "positive" : average < 3 ? "negative" : "mixed";
  const lead =
    sentiment === "positive" ? "Drivers are mostly happy" : sentiment === "negative" ? "Drivers are mostly unhappy" : "Feedback is mixed";
  const likes = top(pos)[0] ? theme(top(pos)[0][0]).positive.toLowerCase() : null;
  const dislikes = issueKeys[0] ? theme(issueKeys[0][0]).negative.toLowerCase() : null;
  const summary =
    `${lead} (${average.toFixed(1)}★ from ${reviews.length} review${reviews.length > 1 ? "s" : ""}).` +
    (likes ? ` Most praised: ${likes}.` : "") +
    (dislikes ? ` Most common complaint: ${dislikes}.` : "");

  return { count: reviews.length, average: Math.round(average * 10) / 10, sentiment, summary, positives, issues, suggestions, model: "rules", sample };
}

/** Synthetic reviews for demos. Never stored in the database. */
export const DEMO_REVIEWS: FeedbackInput[] = [
  { rating: 5, comment: "Space was available right when I arrived. Short walk to SFBU. Easy QR check-in.", location_name: "Mission Bay Garage" },
  { rating: 4, comment: "Good value for downtown. Entrance signage is confusing though.", location_name: "Mission Bay Garage" },
  { rating: 2, comment: "Garage was full at 6pm even with a booking, and it is expensive on weekends.", location_name: "Union Square Lot" },
  { rating: 5, comment: "Clean, well lit and felt safe late at night.", location_name: "Union Square Lot" },
  { rating: 3, comment: "EV charger was broken. Otherwise convenient location.", location_name: "SoMa EV Hub" },
  { rating: 4, comment: "Cheap compared to nearby meters. Spaces are a bit tight.", location_name: "SoMa EV Hub" },
  { rating: 1, comment: "Hard to find the entrance and the ramp is narrow. Dark at night.", location_name: "Embarcadero Lot" },
  { rating: 5, comment: "Found a spot immediately, great price for two hours.", location_name: "Embarcadero Lot" },
];
