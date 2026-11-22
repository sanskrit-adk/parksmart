import { LightbulbIcon, SparklesIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import type { FeedbackSummary } from "@/lib/ai/feedback";
import { cn } from "@/lib/utils";

const SENTIMENT = {
  positive: "bg-free/15 text-free",
  mixed: "bg-filling/15 text-filling",
  negative: "bg-full/15 text-full",
  none: "bg-muted text-muted-foreground",
} as const;

/** GenAI / rule-based summary of customer reviews. Labels demo data explicitly. */
export function FeedbackSummaryCard({ data, title = "AI feedback summary", showSuggestions = true, className }: { data: FeedbackSummary; title?: string; showSuggestions?: boolean; className?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5 shadow-soft", className)} aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold">
          <SparklesIcon className="size-4 text-teal-strong" aria-hidden /> {title}
        </p>
        <div className="flex flex-wrap gap-1.5 text-xs font-medium">
          {data.sample && <span className="rounded-full border border-dashed px-2 py-0.5 text-muted-foreground">Demo data</span>}
          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{data.model === "rules" ? "Rule-based summary" : `AI · ${data.model}`}</span>
          {data.sentiment !== "none" && <span className={cn("rounded-full px-2 py-0.5 capitalize", SENTIMENT[data.sentiment])}>{data.sentiment}</span>}
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed">{data.summary}</p>
      {(data.positives.length > 0 || data.issues.length > 0) && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <List icon={ThumbsUpIcon} label="What drivers like" items={data.positives} empty="No clear positives yet." />
          <List icon={ThumbsDownIcon} label="What to improve" items={data.issues} empty="No recurring complaints." />
        </div>
      )}
      {showSuggestions && data.suggestions.length > 0 && (
        <div className="mt-4 rounded-xl bg-muted/60 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-medium">
            <LightbulbIcon className="size-4 text-teal-strong" aria-hidden /> Suggested improvements
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
            {data.suggestions.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function List({ icon: Icon, label, items, empty }: { icon: typeof ThumbsUpIcon; label: string; items: string[]; empty: string }) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-sm font-medium">
        <Icon className="size-4 text-teal-strong" aria-hidden /> {label}
      </p>
      {items.length ? (
        <ul className="space-y-0.5 text-sm text-muted-foreground">
          {items.map((i) => (
            <li key={i}>• {i}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}
