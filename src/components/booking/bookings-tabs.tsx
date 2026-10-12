"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { BookingActions } from "@/components/booking/booking-actions";
import { Countdown } from "@/components/booking/countdown";
import { BookingStatusBadge } from "@/components/booking/status-badge";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dateTime, money, time } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { BookingWithLocation } from "@/lib/types";

type Tab = "upcoming" | "active" | "past";

export function BookingsTabs({ bookings, userId }: { bookings: BookingWithLocation[]; userId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const tab = (["upcoming", "active", "past"].includes(params.get("tab") ?? "") ? params.get("tab") : null) as Tab | null;

  const groups: Record<Tab, BookingWithLocation[]> = {
    active: bookings.filter((b) => b.status === "active"),
    upcoming: bookings.filter((b) => b.status === "upcoming" || b.status === "pending_payment").sort((a, b) => a.start_time.localeCompare(b.start_time)),
    past: bookings.filter((b) => b.status === "completed" || b.status === "cancelled"),
  };
  const current: Tab = tab ?? (groups.active.length ? "active" : "upcoming");

  // Keep the list fresh when bookings change (payment confirmed, tick, other device).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`bookings:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `user_id=eq.${userId}` }, () => router.refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, router]);

  return (
    <Tabs value={current} onValueChange={(v) => router.replace(`/bookings?tab=${v}`, { scroll: false })}>
      <TabsList className="h-11 w-full sm:w-auto">
        {(["upcoming", "active", "past"] as Tab[]).map((t) => (
          <TabsTrigger key={t} value={t} className="px-4 capitalize">
            {t}
            {groups[t].length > 0 && <span className="ml-1 rounded-full bg-muted px-1.5 text-xs">{groups[t].length}</span>}
          </TabsTrigger>
        ))}
      </TabsList>
      {(["upcoming", "active", "past"] as Tab[]).map((t) => (
        <TabsContent key={t} value={t} className="mt-6 space-y-3">
          {groups[t].length === 0 ? (
            <EmptyState
              art="calendar"
              title={t === "active" ? "Nothing running right now" : t === "upcoming" ? "No upcoming bookings" : "No past bookings yet"}
              description={t === "past" ? "Completed and cancelled bookings show up here." : "Let the AI find you a space in seconds."}
              action={
                <Link href="/find" className={buttonVariants({ variant: "teal" })}>
                  Find parking
                </Link>
              }
            />
          ) : (
            groups[t].map((b) => <BookingCard key={b.id} booking={b} />)
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}

function BookingCard({ booking: b }: { booking: BookingWithLocation }) {
  const live = b.status === "upcoming" || b.status === "active";
  return (
    <article className="rounded-2xl border bg-card p-4 shadow-soft sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <BookingStatusBadge status={b.status} />
          </div>
          <h3 className="truncate text-lg font-semibold">
            <Link href={`/bookings/${b.id}`} className="hover:underline">
              {b.location.name}
            </Link>
          </h3>
          <p className="text-sm text-muted-foreground">
            {dateTime(b.start_time, b.location.timezone)} – {time(b.end_time, b.location.timezone)} · Space {b.spot.label}
          </p>
        </div>
        <div className="text-right">
          <p className="font-bold">{money(b.total_price)}</p>
          {b.refund_amount !== null && b.refund_amount > 0 && <p className="text-xs text-muted-foreground">{money(b.refund_amount)} refunded</p>}
        </div>
      </div>
      {live && <Countdown start={b.start_time} end={b.end_time} className="mt-3" />}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href={`/bookings/${b.id}`} className={buttonVariants({ size: "sm", variant: "secondary" })}>
          {live ? "QR & details" : "Details"}
        </Link>
        <BookingActions booking={b} />
      </div>
    </article>
  );
}
