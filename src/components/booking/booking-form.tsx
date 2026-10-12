"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftIcon, CarIcon, CheckIcon, ClockIcon, CreditCardIcon, LockIcon, SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PredictionPill } from "@/components/parking/availability";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { api } from "@/lib/fetcher";
import { dateTime, duration, money, normalizePlate } from "@/lib/format";
import { priceBreakdown, REFUND_POLICY_TEXT } from "@/lib/pricing";
import type { ForecastPoint, Vehicle } from "@/lib/types";
import { cn } from "@/lib/utils";

const DURATIONS = [0.5, 1, 2, 3, 4, 6, 8, 12, 24];

function roundUp(d: Date, minutes = 5) {
  const ms = minutes * 60_000;
  return new Date(Math.ceil(d.getTime() / ms) * ms);
}
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function BookingForm({
  location,
  vehicles,
  defaultPlate,
  initialStart,
  initialHours,
  cancelledBookingId,
}: {
  location: { id: string; name: string; hourly_price: number; timezone: string };
  vehicles: Vehicle[];
  defaultPlate: string | null;
  initialStart: string | null;
  initialHours: number | null;
  cancelledBookingId: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [startInput, setStartInput] = useState(() => {
    const s = initialStart && !Number.isNaN(Date.parse(initialStart)) ? new Date(initialStart) : new Date();
    return toLocalInput(roundUp(s < new Date() ? new Date() : s));
  });
  const [hours, setHours] = useState(initialHours && initialHours >= 0.5 && initialHours <= 24 ? initialHours : 2);
  const [plate, setPlate] = useState(vehicles.find((v) => v.is_default)?.plate ?? vehicles[0]?.plate ?? defaultPlate ?? "");
  const [errors, setErrors] = useState<{ start?: string; plate?: string }>({});
  const [prob, setProb] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Release the hold when the user comes back from a cancelled Stripe checkout.
  useEffect(() => {
    if (!cancelledBookingId) return;
    api(`/api/bookings/${cancelledBookingId}/cancel`, { method: "POST" })
      .then(() => toast.info("Payment cancelled", { description: "Your hold was released. Nothing was charged." }))
      .catch(() => undefined);
    router.replace(`/book/${location.id}`);
  }, [cancelledBookingId, location.id, router]);

  const start = useMemo(() => new Date(startInput), [startInput]);
  const end = useMemo(() => new Date(start.getTime() + hours * 3_600_000), [start, hours]);
  const price = useMemo(() => priceBreakdown(location.hourly_price, start, end), [location.hourly_price, start, end]);

  // AI prediction for the chosen arrival time.
  useEffect(() => {
    if (Number.isNaN(start.getTime())) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/locations/${location.id}/forecast?from=${encodeURIComponent(start.toISOString())}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: { points?: ForecastPoint[] }) => setProb(d.points?.[0]?.free_probability ?? null))
        .catch(() => undefined);
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [start, location.id]);

  function validate() {
    const e: typeof errors = {};
    if (Number.isNaN(start.getTime())) e.start = "Choose a start time";
    else if (start.getTime() < Date.now() - 5 * 60_000) e.start = "Start time is in the past";
    else if (start.getTime() > Date.now() + 60 * 86_400_000) e.start = "You can book up to 60 days ahead";
    if (plate && !/^[A-Z0-9]{2,8}$/.test(normalizePlate(plate))) e.plate = "Plates are 2–8 letters or digits";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function pay() {
    setSubmitting(true);
    try {
      const res = await api<{ booking: { id: string }; checkout_url: string | null }>("/api/bookings", {
        json: { location_id: location.id, start_time: start.toISOString(), end_time: end.toISOString(), vehicle_plate: plate ? normalizePlate(plate) : null },
      });
      if (res.checkout_url) {
        toast.success("Space held for 30 minutes", { description: "Redirecting to secure checkout…" });
        window.location.href = res.checkout_url;
      } else {
        toast.success("Booked!");
        router.push(`/bookings/${res.booking.id}`);
      }
    } catch (e) {
      const msg = (e as Error).message;
      toast.error("Couldn't reserve", { description: msg });
      if (/sign in/i.test(msg)) router.push(`/login?next=${encodeURIComponent(`/book/${location.id}`)}`);
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <ol className="flex items-center gap-2 text-sm" aria-label="Booking steps">
        {["Time", "Review", "Pay", "Confirmed"].map((label, i) => {
          const done = i + 1 < step;
          const current = i + 1 === step;
          return (
            <li key={label} className="flex items-center gap-2" aria-current={current ? "step" : undefined}>
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border text-xs font-semibold",
                  (done || current) && "border-transparent bg-primary text-primary-foreground",
                )}
              >
                {done ? <CheckIcon className="size-4" /> : i + 1}
              </span>
              <span className={cn("hidden sm:inline", !current && "text-muted-foreground")}>{label}</span>
              {i < 3 && <span className="h-px w-4 bg-border sm:w-8" aria-hidden />}
            </li>
          );
        })}
      </ol>

      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.div key="s1" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="start">
                <ClockIcon className="size-4" /> Arrival
              </Label>
              <input
                id="start"
                type="datetime-local"
                value={startInput}
                min={toLocalInput(new Date())}
                onChange={(e) => {
                  setStartInput(e.target.value);
                  setErrors((x) => ({ ...x, start: undefined }));
                }}
                aria-invalid={Boolean(errors.start) || undefined}
                aria-describedby={errors.start ? "start-error" : undefined}
                className="h-12 w-full rounded-xl border border-input bg-card px-3.5 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
              />
              {errors.start && (
                <p id="start-error" className="text-sm text-destructive">
                  {errors.start}
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {[
                  ["Now", 0],
                  ["In 30 min", 30],
                  ["In 1 hour", 60],
                ].map(([label, mins]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setStartInput(toLocalInput(roundUp(new Date(Date.now() + Number(mins) * 60_000))))}
                    className="rounded-full border px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">How long?</legend>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={hours === d}
                    onClick={() => setHours(d)}
                    className="h-12 rounded-xl border text-sm font-medium transition-colors hover:bg-muted aria-pressed:border-transparent aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                  >
                    {d < 1 ? "30 min" : `${d} h`}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="plate">
                <CarIcon className="size-4" /> Vehicle plate <span className="font-normal text-muted-foreground">(for plate check-in)</span>
              </Label>
              {vehicles.length > 0 ? (
                <NativeSelect id="plate" value={plate} onChange={(e) => setPlate(e.target.value)}>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.plate}>
                      {v.plate}
                      {v.label ? ` — ${v.label}` : ""}
                    </option>
                  ))}
                  <option value="">No plate</option>
                </NativeSelect>
              ) : (
                <Input
                  id="plate"
                  value={plate}
                  onChange={(e) => {
                    setPlate(e.target.value.toUpperCase());
                    setErrors((x) => ({ ...x, plate: undefined }));
                  }}
                  placeholder="e.g. 8ABC123"
                  autoCapitalize="characters"
                  aria-invalid={Boolean(errors.plate) || undefined}
                />
              )}
              {errors.plate && <p className="text-sm text-destructive">{errors.plate}</p>}
            </div>

            {prob !== null && (
              <div className="flex items-center gap-2 text-sm">
                <SparklesIcon className="size-4 text-teal-strong" aria-hidden />
                <PredictionPill probability={prob} />
              </div>
            )}

            <Button size="xl" className="w-full" onClick={() => validate() && setStep(2)}>
              Review · {money(price.total)}
            </Button>
          </motion.div>
        ) : (
          <motion.div key="s2" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-6">
            <div className="rounded-2xl border bg-card p-5">
              <p className="font-semibold">{location.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {dateTime(start.toISOString(), location.timezone)} → {dateTime(end.toISOString(), location.timezone)}
              </p>
              {plate && <p className="mt-1 text-sm text-muted-foreground">Vehicle {normalizePlate(plate)}</p>}
              <dl className="mt-4 space-y-2 border-t pt-4 text-sm">
                <Row label={`${money(price.hourly_price)} × ${duration(price.hours)}`} value={money(price.subtotal)} />
                <Row label="Service fee" value={money(price.service_fee)} />
                <Row label="Total" value={money(price.total)} strong />
              </dl>
            </div>
            <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">{REFUND_POLICY_TEXT}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="xl" onClick={() => setStep(1)} disabled={submitting} aria-label="Back to time selection">
                <ArrowLeftIcon />
              </Button>
              <Button variant="teal" size="xl" className="flex-1" onClick={pay} loading={submitting}>
                {price.total === 0 ? (
                  "Confirm free booking"
                ) : (
                  <>
                    <CreditCardIcon /> Pay {money(price.total)}
                  </>
                )}
              </Button>
            </div>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <LockIcon className="size-3.5" /> Secure checkout by Stripe (test mode: use card 4242 4242 4242 4242)
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between", strong && "border-t pt-2 text-base font-bold")}>
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
