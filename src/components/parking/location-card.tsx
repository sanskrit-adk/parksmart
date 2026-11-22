"use client";

import { motion } from "framer-motion";
import { AccessibilityIcon, CarIcon, FootprintsIcon, MapPinIcon, SparklesIcon, StarIcon, UmbrellaIcon, ZapIcon } from "lucide-react";
import Link from "next/link";
import { AiPickBadge, AvailabilityBadge, PredictionPill } from "@/components/parking/availability";
import { FavoriteButton } from "@/components/parking/favorite-button";
import { buttonVariants } from "@/components/ui/button";
import { distance, money, TYPE_LABEL } from "@/lib/format";
import type { RankedLocation } from "@/lib/types";
import { cn } from "@/lib/utils";

export function LocationCard({
  location: l,
  selected,
  favorite,
  durationHours,
  onHover,
  bookingQuery,
  originName,
}: {
  location: RankedLocation;
  selected?: boolean;
  favorite?: boolean;
  durationHours: number;
  onHover?: (id: string | null) => void;
  bookingQuery?: string;
  /** What distances are measured from ("you", a destination name…). */
  originName?: string;
}) {
  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      onMouseEnter={() => onHover?.(l.id)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(l.id)}
      aria-label={`${l.name}${l.ai_pick ? ", AI Pick" : ""}`}
      className={cn(
        "group relative rounded-2xl border bg-card p-4 shadow-soft transition-all hover:shadow-lift",
        selected && "ring-2 ring-teal",
        l.ai_pick && "border-teal/60",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            {l.ai_pick && <AiPickBadge />}
            <span className="text-xs font-medium text-muted-foreground">{TYPE_LABEL[l.type]}</span>
            {l.rating !== null && l.review_count > 0 && (
              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground">
                <StarIcon className="size-3 fill-filling text-filling" aria-hidden /> {l.rating.toFixed(1)}
                <span className="sr-only">stars from</span> ({l.review_count})
              </span>
            )}
          </div>
          <h3 className="truncate text-base font-semibold">
            <Link href={`/spots/${l.id}${bookingQuery ? `?${bookingQuery}` : ""}`} className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none">
              {l.name}
            </Link>
          </h3>
          {l.address && <p className="truncate text-sm text-muted-foreground">{l.address}</p>}
        </div>
        <div className="relative z-10 flex flex-col items-end">
          <p className="text-lg leading-none font-bold">
            {l.hourly_price === 0 ? "Free" : money(l.hourly_price)}
            {l.hourly_price > 0 && <span className="text-xs font-medium text-muted-foreground">/hr</span>}
          </p>
          {l.price_estimated && <span className="mt-0.5 text-[11px] text-muted-foreground">est. price</span>}
          <FavoriteButton locationId={l.id} initial={favorite} className="-mr-2 mt-1" />
        </div>
      </div>

      {l.ai_pick ? (
        <div className="mt-2 rounded-xl bg-accent/70 px-3 py-2 text-sm text-accent-foreground">
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
            <SparklesIcon className="size-3.5" aria-hidden /> Why we recommend it
          </p>
          <p className="mt-0.5">{l.explanation || l.reason}</p>
        </div>
      ) : (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-foreground/90" title={l.explanation}>
          <SparklesIcon className="mt-0.5 size-3.5 shrink-0 text-teal-strong" aria-hidden />
          <span>{l.reason}</span>
        </p>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border border-dashed p-2.5 text-xs sm:grid-cols-4">
        <Fact label={`From ${originName && originName !== "you" ? "destination" : "you"}`} icon={MapPinIcon} value={distance(l.distance_m)} />
        <Fact label="Walking time" icon={FootprintsIcon} value={`${l.walk_minutes} min`} />
        <Fact label="Predicted availability" icon={SparklesIcon} value={`${Math.round(l.free_probability * 100)}%`} predicted />
        <Fact label="Est. free at arrival" icon={CarIcon} value={`~${l.predicted_free_spaces} of ${l.total_spots}`} predicted />
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PredictionPill probability={l.free_probability} />
        <AvailabilityBadge available={l.available_now} total={l.total_spots} mode={l.availability_mode} className="relative z-10" />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
          {l.covered && <Amenity icon={UmbrellaIcon} label="Covered" />}
          {l.ev_charging && <Amenity icon={ZapIcon} label="EV charging" />}
          {l.accessible && <Amenity icon={AccessibilityIcon} label="Accessible" />}
          {l.is_open === false && <span className="text-xs font-medium text-full">Closed then</span>}
        </div>
        <Link
          href={`/book/${l.id}?hours=${durationHours}${bookingQuery ? `&${bookingQuery}` : ""}`}
          className={cn(buttonVariants({ size: "sm", variant: l.ai_pick ? "teal" : "default" }), "relative z-10")}
        >
          Reserve · {money(l.estimated_total)}
        </Link>
      </div>
    </motion.article>
  );
}

function Fact({ label, value, icon: Icon, predicted }: { label: string; value: string; icon: typeof ZapIcon; predicted?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-muted-foreground">
        <Icon className="size-3 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="mt-0.5 flex items-center gap-1 font-semibold tabular-nums">
        {value}
        {predicted && <span className="text-[10px] font-medium text-teal-strong" title="ML prediction, not a live count">· predicted</span>}
      </dd>
    </div>
  );
}

function Amenity({ icon: Icon, label }: { icon: typeof ZapIcon; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs" title={label}>
      <Icon className="size-3.5" aria-hidden />
      <span>{label}</span>
    </span>
  );
}

export function LocationCardSkeleton() {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-soft" aria-hidden>
      <div className="flex justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-6 w-14 animate-pulse rounded bg-muted" />
      </div>
      <div className="mt-3 h-4 w-5/6 animate-pulse rounded bg-muted" />
      <div className="mt-3 flex gap-2">
        <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
        <div className="h-6 w-28 animate-pulse rounded-full bg-muted" />
      </div>
    </div>
  );
}
