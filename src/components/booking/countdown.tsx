"use client";

import { TimerIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { countdown } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Live countdown: "starts in" for upcoming, "time left" for active bookings. */
export function Countdown({ start, end, className, large }: { start: string; end: string; className?: string; large?: boolean }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const refreshed = useRef(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const ended = now >= e;
  const running = now >= s && !ended;

  useEffect(() => {
    if (ended && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [ended, router]);

  const total = e - s;
  const progress = running ? Math.min(100, ((now - s) / total) * 100) : 0;
  const lowTime = running && e - now < 15 * 60_000;

  return (
    <div className={cn("space-y-1.5", className)} role="timer" aria-live="off">
      <p className={cn("flex items-center gap-1.5 font-semibold tabular-nums", large ? "text-3xl" : "text-sm", lowTime && "text-full")}>
        <TimerIcon className={large ? "size-6" : "size-4"} aria-hidden />
        {ended ? "Ended" : running ? `${countdown(e - now)} left` : `Starts in ${countdown(s - now)}`}
      </p>
      {running && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className={cn("h-full rounded-full transition-[width]", lowTime ? "bg-full" : "bg-teal-strong")} style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}
