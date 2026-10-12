"use client";

import { animate, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export interface PublicStats {
  locations: number;
  spaces_free_now: number;
  live_locations: number;
  bookings_today: number;
}

export function LiveStats({ stats }: { stats: PublicStats | null }) {
  const items = [
    { label: "Parking locations mapped", value: stats?.locations ?? 0 },
    { label: "Spaces estimated free now", value: stats?.spaces_free_now ?? 0 },
    { label: "Locations with live counts", value: stats?.live_locations ?? 0 },
    { label: "Bookings today", value: stats?.bookings_today ?? 0 },
  ];
  return (
    <section aria-label="Live stats" className="mx-auto -mt-10 w-full max-w-5xl px-4 sm:px-6">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border shadow-lift md:grid-cols-4">
        {items.map((s) => (
          <div key={s.label} className="bg-card px-5 py-6 text-center">
            <p className="text-2xl font-bold tabular-nums sm:text-3xl">{stats ? <Counter to={s.value} /> : "—"}</p>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{s.label}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span className="relative flex size-2">
          <span className="absolute inset-0 animate-pulse-ring rounded-full bg-free" />
          <span className="relative size-2 rounded-full bg-free" />
        </span>
        Live from the ParkSmart database · OpenStreetMap & SFMTA data
      </p>
    </section>
  );
}

function Counter({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView || reduced) return;
    const c = animate(0, to, { duration: 1.2, ease: "easeOut", onUpdate: (v) => setVal(Math.round(v)) });
    return () => c.stop();
  }, [inView, to, reduced]);
  return <span ref={ref}>{(reduced ? to : val).toLocaleString("en-US")}</span>;
}
