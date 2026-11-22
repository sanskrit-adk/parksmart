"use client";

import { FlaskConicalIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Visible "Demo data" label for every screen built on generated data. */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border border-dashed border-filling/60 bg-filling/10 px-2 py-0.5 text-xs font-medium", className)}>
      <FlaskConicalIcon className="size-3" aria-hidden /> Demo data
    </span>
  );
}

/** Demo data depends on the viewer's clock, so render it only after mount (no hydration mismatch). */
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

/** Heat colour for a 0–1 demand value, using the app's availability tokens. */
export function heatClass(d: number) {
  if (d >= 0.85) return "bg-full/85 text-white";
  if (d >= 0.7) return "bg-full/50";
  if (d >= 0.55) return "bg-filling/60";
  if (d >= 0.4) return "bg-filling/30";
  if (d >= 0.25) return "bg-free/30";
  return "bg-free/15";
}
