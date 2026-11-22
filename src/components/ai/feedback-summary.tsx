"use client";

import { AlertTriangleIcon, LightbulbIcon, MessageSquareQuoteIcon, RefreshCwIcon, SparklesIcon, StarIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Summary {
  overview: string;
  sentiment: "positive" | "mixed" | "negative";
  average_rating: number;
  review_count: number;
  positives: string[];
  issues: string[];
  suggestions: string[];
  highlights: string[];
}

interface Result {
  summary: Summary;
  engine: string;
  sample: boolean;
  real_review_count: number;
  generated_at: string;
}

const SENTIMENT = {
  positive: "bg-free/12 text-[color-mix(in_oklch,var(--free),black_25%)] dark:text-free",
  mixed: "bg-filling/15 text-[color-mix(in_oklch,var(--filling),black_40%)] dark:text-filling",
  negative: "bg-full/12 text-full",
} as const;

/** GenAI summary of customer reviews, for admins (all) or hosts (their listings). */
export function FeedbackSummaryPanel({ locationId, title = "Customer feedback summary" }: { locationId?: string; title?: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      setResult(await api<Result>("/api/ai/feedback", { json: locationId ? { location_id: locationId } : {} }));
    } catch (e) {
      toast.error("Couldn't summarise feedback", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  const s = result?.summary;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">
            {result
              ? `Generated ${relativeTime(result.generated_at)} · ${result.engine === "rules" ? "rule-based keyword themes (AI key not configured)" : `Generative AI (${result.engine})`}`
              : "Generative AI reads every review and turns it into themes, issues and next steps."}
          </p>
        </div>
        <Button variant="teal" onClick={run} loading={loading}>
          {result ? <RefreshCwIcon /> : <SparklesIcon />} {result ? "Summarise again" : "Summarise feedback"}
        </Button>
      </div>

      {result?.sample && (
        <p className="flex items-start gap-2 rounded-xl border border-dashed border-filling/60 bg-filling/10 px-3 py-2 text-sm">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-filling" aria-hidden />
          <span>
            <strong>Demonstration:</strong> there {result.real_review_count === 1 ? "is" : "are"} only {result.real_review_count} real review
            {result.real_review_count === 1 ? "" : "s"} so far, so this summary uses a labelled set of sample reviews. It switches to real reviews automatically once three or more exist.
          </span>
        </p>
      )}

      {s && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-navy p-5 text-white">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="flex items-center gap-1 text-teal">
                <SparklesIcon className="size-4" aria-hidden /> AI summary
              </span>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize", SENTIMENT[s.sentiment])}>{s.sentiment}</span>
              <span className="flex items-center gap-1 text-white/80">
                <StarIcon className="size-3.5 fill-filling text-filling" aria-hidden /> {s.average_rating.toFixed(1)} from {s.review_count} reviews
              </span>
            </div>
            <p className="mt-2 text-lg leading-snug font-medium">{s.overview}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <ListCard icon={ThumbsUpIcon} title="What drivers like" items={s.positives} empty="No clear positives yet." />
            <ListCard icon={ThumbsDownIcon} title="Issues to fix" items={s.issues} empty="No recurring issues." />
            <ListCard icon={LightbulbIcon} title="Suggested improvements" items={s.suggestions} empty="No suggestions." />
          </div>
          {s.highlights.length > 0 && <ListCard icon={MessageSquareQuoteIcon} title="Feedback highlights" items={s.highlights} empty="" />}
        </div>
      )}
    </div>
  );
}

function ListCard({ icon: Icon, title, items, empty }: { icon: typeof StarIcon; title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 text-sm shadow-soft">
      <p className="mb-2 flex items-center gap-1.5 font-semibold">
        <Icon className="size-4 text-teal-strong" aria-hidden /> {title}
      </p>
      {items.length ? (
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}
