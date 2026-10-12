"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CameraIcon, CheckCircle2Icon, KeyboardIcon, MapPinIcon, PlusIcon, ScanLineIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/components/providers";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGeolocation } from "@/hooks/use-geolocation";
import { distance, money, normalizePlate } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

type Result =
  | { status: "checked_in"; plate: string; engine: string; confidence: number; booking: { id: string }; location_name: string | null }
  | {
      status: "no_booking" | "not_on_account";
      plate: string;
      engine: string;
      confidence: number;
      pending_booking: { id: string } | null;
      nearest: { id: string; name: string; distance_m: number; hourly_price: number } | null;
    };

export function PlateCheckin() {
  const { profile } = useSession();
  const geo = useGeolocation({ auto: true });
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const lastSubmission = useRef<FormData | null>(null);

  async function submit(form: FormData) {
    if (geo.position) {
      form.set("lat", String(geo.position.lat));
      form.set("lng", String(geo.position.lng));
    }
    lastSubmission.current = form;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/ai/plate", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Check-in failed");
      setResult(data as Result);
      if (data.status === "checked_in") toast.success("Checked in!", { description: data.location_name ?? undefined });
    } catch (e) {
      toast.error("Plate check-in failed", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10 MB");
      return;
    }
    setPreview(URL.createObjectURL(file));
    const form = new FormData();
    form.set("image", file);
    void submit(form);
    e.target.value = "";
  }

  function onTyped(e: React.FormEvent) {
    e.preventDefault();
    const plate = normalizePlate(typed);
    if (!/^[A-Z0-9]{2,8}$/.test(plate)) {
      setTypedError("Plates are 2–8 letters or digits");
      return;
    }
    setPreview(null);
    const form = new FormData();
    form.set("plate", plate);
    void submit(form);
  }

  async function addPlate(plate: string) {
    if (!profile) return;
    setAdding(true);
    const { error } = await createClient().from("vehicles").insert({ user_id: profile.id, plate, is_default: false });
    setAdding(false);
    if (error && error.code !== "23505") {
      toast.error("Couldn't add the plate");
      return;
    }
    toast.success(`${plate} added to your vehicles`);
    const form = new FormData();
    form.set("plate", plate);
    void submit(form);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border bg-card p-6 text-center shadow-soft">
        <div className="relative mx-auto flex aspect-[2/1] max-w-sm items-center justify-center overflow-hidden rounded-2xl bg-navy">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Your plate photo" className="h-full w-full object-cover" />
          ) : (
            <ScanLineIcon className="size-14 text-teal" aria-hidden />
          )}
          {loading && (
            <motion.span
              aria-hidden
              className="absolute inset-x-0 h-1 bg-teal shadow-[0_0_20px_4px] shadow-teal/60"
              animate={{ top: ["5%", "92%", "5%"] }}
              transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
            />
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={onPhoto} aria-label="Take a photo of your licence plate" />
        <Button size="xl" variant="teal" className="mt-6 w-full max-w-sm" onClick={() => fileRef.current?.click()} loading={loading}>
          <CameraIcon /> Scan my plate
        </Button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheckIcon className="size-3.5" /> The photo is read once and never stored.
        </p>
      </div>

      <form onSubmit={onTyped} className="space-y-2" noValidate>
        <Label htmlFor="typed-plate">
          <KeyboardIcon className="size-4" /> Or type it
        </Label>
        <div className="flex gap-2">
          <Input
            id="typed-plate"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value.toUpperCase());
              setTypedError(null);
            }}
            placeholder="8ABC123"
            autoCapitalize="characters"
            aria-invalid={Boolean(typedError) || undefined}
            className="font-mono tracking-widest"
          />
          <Button type="submit" size="lg" className="h-11" loading={loading} disabled={!typed}>
            Check in
          </Button>
        </div>
        {typedError && <p className="text-sm text-destructive">{typedError}</p>}
      </form>

      <AnimatePresence mode="wait">
        {result && (
          <motion.div key={result.status + result.plate} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} aria-live="polite">
            {result.status === "checked_in" ? (
              <div className="rounded-2xl border border-free/40 bg-free/10 p-5">
                <p className="flex items-center gap-2 text-lg font-semibold">
                  <CheckCircle2Icon className="size-6 text-free" /> {result.plate} checked in
                </p>
                <p className="mt-1 text-sm text-muted-foreground">Your booking{result.location_name ? ` at ${result.location_name}` : ""} is now active.</p>
                <Link href={`/bookings/${result.booking.id}`} className={buttonVariants({ className: "mt-4" })}>
                  View booking
                </Link>
              </div>
            ) : (
              <div className="space-y-4 rounded-2xl border bg-card p-5">
                <p className="text-sm">
                  Read plate <strong className="font-mono tracking-widest">{result.plate}</strong>
                  {result.engine === "vision" && ` (${Math.round(result.confidence * 100)}% confident)`}.
                </p>
                {result.status === "not_on_account" && (
                  <div className="rounded-xl bg-filling/10 p-4 text-sm">
                    <p>This plate isn&apos;t on your account yet.</p>
                    <Button size="sm" className="mt-3" onClick={() => addPlate(result.plate)} loading={adding}>
                      <PlusIcon /> Add {result.plate} & check in
                    </Button>
                  </div>
                )}
                {result.status === "no_booking" && <p className="text-sm text-muted-foreground">You don&apos;t have a booking starting in the next 30 minutes.</p>}
                {result.nearest ? (
                  <div className="rounded-xl border p-4">
                    <p className="flex items-center gap-2 font-medium">
                      <MapPinIcon className="size-4 text-teal-strong" /> You&apos;re at {result.nearest.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {distance(result.nearest.distance_m)} away · {result.nearest.hourly_price === 0 ? "Free" : `${money(result.nearest.hourly_price)}/hr`}
                    </p>
                    <Link
                      href={`/book/${result.nearest.id}?start=${encodeURIComponent(new Date().toISOString())}`}
                      className={buttonVariants({ variant: "teal", className: "mt-3" })}
                    >
                      Start parking here now
                    </Link>
                  </div>
                ) : (
                  <Link href="/find" className={buttonVariants({ variant: "outline" })}>
                    Find parking nearby
                  </Link>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
