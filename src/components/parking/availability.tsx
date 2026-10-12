import { RadioIcon, SparklesIcon, TrendingUpIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { percent } from "@/lib/format";
import type { AvailabilityMode } from "@/lib/types";
import { cn } from "@/lib/utils";

export type Level = "free" | "filling" | "full";

/** green = plenty, amber = filling up, red = full */
export function availabilityLevel(available: number | null, total: number): Level {
  if (available === null || available === undefined) return "filling";
  if (available <= 0) return "full";
  const share = available / Math.max(1, total);
  if (available <= 2 || share < 0.15) return "filling";
  return "free";
}

export const LEVEL_LABEL: Record<Level, string> = { free: "Spaces free", filling: "Filling up", full: "Full" };
const DOT: Record<Level, string> = { free: "bg-free", filling: "bg-filling", full: "bg-full" };

export function AvailabilityBadge({
  available,
  total,
  mode,
  className,
}: {
  available: number | null;
  total: number;
  mode: AvailabilityMode | null;
  className?: string;
}) {
  const level = availabilityLevel(available, total);
  const live = mode === "live";
  return (
    <Tooltip>
      <TooltipTrigger render={<span className={cn("inline-flex", className)} />}>
        <Badge variant={level} className="h-6 gap-1.5 px-2.5">
          <span className="relative flex size-2" aria-hidden>
            {live && <span className={cn("absolute inset-0 animate-pulse-ring rounded-full", DOT[level])} />}
            <span className={cn("relative size-2 rounded-full", DOT[level])} />
          </span>
          {available === null ? LEVEL_LABEL[level] : level === "full" ? "Full" : `${available} free`}
          <span className="font-normal opacity-80">· {live ? "Live" : "Estimated"}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        {live
          ? "Live: counted from ParkSmart bookings on host-managed spaces, or from a camera image in the last 30 minutes."
          : "Estimated: no sensor here, so we combine typical demand for this time of day with ParkSmart bookings."}
      </TooltipContent>
    </Tooltip>
  );
}

export function PredictionPill({ probability, compact, className }: { probability: number; compact?: boolean; className?: string }) {
  const level: Level = probability >= 0.7 ? "free" : probability >= 0.4 ? "filling" : "full";
  const text =
    probability >= 0.7 ? "Likely free when you arrive" : probability >= 0.4 ? "Might be busy when you arrive" : "Likely full when you arrive";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        level === "free" && "bg-free/12 text-[color-mix(in_oklch,var(--free),black_30%)] dark:text-free",
        level === "filling" && "bg-filling/15 text-[color-mix(in_oklch,var(--filling),black_45%)] dark:text-filling",
        level === "full" && "bg-full/12 text-[color-mix(in_oklch,var(--full),black_25%)] dark:text-full",
        className,
      )}
    >
      <TrendingUpIcon className="size-3.5" aria-hidden />
      {compact ? percent(probability) : `${text} (${percent(probability)})`}
    </span>
  );
}

export function AiPickBadge({ className }: { className?: string }) {
  return (
    <Badge variant="ai" className={cn("h-6 gap-1 px-2.5 font-semibold", className)}>
      <SparklesIcon aria-hidden /> AI Pick
    </Badge>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-free", className)}>
      <RadioIcon className="size-3.5" aria-hidden /> Live
    </span>
  );
}
