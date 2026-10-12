"use client";

import { CalendarClockIcon, LogInIcon, RotateCcwIcon, StarIcon, XCircleIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DirectionsButton } from "@/components/parking/directions-button";
import { useSession } from "@/components/providers";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/fetcher";
import { dateTime, money } from "@/lib/format";
import { priceBreakdown, REFUND_POLICY_TEXT } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/client";
import type { BookingWithLocation } from "@/lib/types";
import { cn } from "@/lib/utils";

const EXTENSIONS = [30, 60, 120, 180];

/** Check-in opens 30 minutes before start and closes at the end time. */
function inCheckInWindow(start: string, end: string) {
  const now = Date.now();
  return new Date(start).getTime() - now <= 30 * 60_000 && new Date(end).getTime() > now;
}

export function BookingActions({ booking: b, size = "sm" }: { booking: BookingWithLocation; size?: "sm" | "default" }) {
  const router = useRouter();
  const [extendOpen, setExtendOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [refund, setRefund] = useState<{ amount: number; rule: string } | null>(null);
  const [extraMins, setExtraMins] = useState(60);

  const live = b.status === "upcoming" || b.status === "active";
  const canCheckIn = live && !b.checked_in_at && inCheckInWindow(b.start_time, b.end_time);

  async function openCancel() {
    setCancelOpen(true);
    setRefund(null);
    try {
      const res = await api<{ refund: { amount: number; rule: string } }>(`/api/bookings/${b.id}/cancel`);
      setRefund(res.refund);
    } catch (e) {
      toast.error((e as Error).message);
      setCancelOpen(false);
    }
  }

  async function doCancel() {
    setBusy("cancel");
    try {
      const res = await api<{ refund: { amount: number } }>(`/api/bookings/${b.id}/cancel`, { method: "POST" });
      toast.success("Booking cancelled", { description: res.refund.amount > 0 ? `${money(res.refund.amount)} will be refunded to your card` : "No refund applies" });
      setCancelOpen(false);
      router.refresh();
    } catch (e) {
      toast.error("Couldn't cancel", { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function doExtend() {
    setBusy("extend");
    try {
      const res = await api<{ url: string | null; new_end_time: string }>(`/api/bookings/${b.id}/extend`, { json: { minutes: extraMins } });
      if (res.url) {
        toast.success("Redirecting to payment…");
        window.location.href = res.url;
        return;
      }
      toast.success(`Extended until ${dateTime(res.new_end_time)}`);
      setExtendOpen(false);
      router.refresh();
    } catch (e) {
      toast.error("Couldn't extend", { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function doCheckIn() {
    setBusy("checkin");
    try {
      await api(`/api/bookings/${b.id}/checkin`, { method: "POST" });
      toast.success("Checked in — enjoy your stay!");
      router.refresh();
    } catch (e) {
      toast.error("Couldn't check in", { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const extendPrice = priceBreakdown(b.location.hourly_price, new Date(b.end_time), new Date(new Date(b.end_time).getTime() + extraMins * 60_000)).subtotal;

  return (
    <div className="flex flex-wrap gap-2">
      {canCheckIn && (
        <Button size={size} variant="teal" onClick={doCheckIn} loading={busy === "checkin"}>
          <LogInIcon /> I&apos;ve arrived
        </Button>
      )}
      {live && <DirectionsButton lat={b.location.lat} lng={b.location.lng} label={b.location.name} size={size} />}
      {live && (
        <Button size={size} variant="outline" onClick={() => setExtendOpen(true)}>
          <CalendarClockIcon /> Extend
        </Button>
      )}
      {(live || b.status === "pending_payment") && (
        <Button size={size} variant="destructive" onClick={openCancel}>
          <XCircleIcon /> {b.status === "pending_payment" ? "Release hold" : "Cancel"}
        </Button>
      )}
      {b.status === "completed" && !b.has_review && (
        <Button size={size} variant="teal" onClick={() => setRateOpen(true)}>
          <StarIcon /> Rate
        </Button>
      )}
      {(b.status === "completed" || b.status === "cancelled") && (
        <Link href={`/book/${b.location.id}`} className={buttonVariants({ size, variant: "outline" })}>
          <RotateCcwIcon /> Rebook
        </Link>
      )}

      <Dialog open={extendOpen} onOpenChange={setExtendOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Extend your booking</DialogTitle>
            <DialogDescription>Currently ends {dateTime(b.end_time, b.location.timezone)}.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Extra time">
            {EXTENSIONS.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={extraMins === m}
                onClick={() => setExtraMins(m)}
                className="h-12 rounded-xl border text-sm font-medium aria-checked:border-transparent aria-checked:bg-primary aria-checked:text-primary-foreground"
              >
                +{m < 60 ? `${m}m` : `${m / 60}h`}
              </button>
            ))}
          </div>
          <p className="text-sm">
            New end: <strong>{dateTime(new Date(new Date(b.end_time).getTime() + extraMins * 60_000).toISOString(), b.location.timezone)}</strong> · Extra{" "}
            <strong>{money(extendPrice)}</strong>
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendOpen(false)}>
              Keep current time
            </Button>
            <Button onClick={doExtend} loading={busy === "extend"}>
              {extendPrice > 0 ? `Pay ${money(Math.max(0.5, extendPrice))}` : "Extend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{b.status === "pending_payment" ? "Release this hold?" : "Cancel this booking?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {refund ? (
                <>
                  You&apos;ll get <strong className="text-foreground">{money(refund.amount)}</strong> back. {refund.rule}.
                  <span className="mt-2 block text-xs">{REFUND_POLICY_TEXT}</span>
                </>
              ) : (
                "Checking the refund you're entitled to…"
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep booking</AlertDialogCancel>
            <Button variant="destructive" onClick={doCancel} loading={busy === "cancel"} disabled={!refund}>
              Yes, cancel
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RateDialog booking={b} open={rateOpen} onOpenChange={setRateOpen} />
    </div>
  );
}

function RateDialog({ booking, open, onOpenChange }: { booking: BookingWithLocation; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { profile } = useSession();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!rating) {
      setError("Pick a star rating");
      return;
    }
    if (comment.length > 1000) {
      setError("Keep it under 1000 characters");
      return;
    }
    setSaving(true);
    const { error: err } = await createClient()
      .from("reviews")
      .insert({ user_id: profile?.id, location_id: booking.location.id, booking_id: booking.id, rating, comment: comment.trim() || null });
    setSaving(false);
    if (err) {
      toast.error(err.code === "23505" ? "You already reviewed this booking" : "Couldn't save your review");
      return;
    }
    toast.success("Thanks for your review!");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rate {booking.location.name}</DialogTitle>
          <DialogDescription>Your review helps the AI recommend better spots to other drivers.</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              onClick={() => {
                setRating(n);
                setError(null);
              }}
              className="rounded-lg p-1.5"
            >
              <StarIcon className={cn("size-9 transition-colors", n <= rating ? "fill-filling text-filling" : "text-border")} />
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <Label htmlFor="review-comment">Comment (optional)</Label>
          <Textarea id="review-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} placeholder="Easy to find? Safe? Tight spaces?" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Later
          </Button>
          <Button onClick={submit} loading={saving}>
            Submit review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
