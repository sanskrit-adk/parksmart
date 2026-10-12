"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AccessibilityIcon, ArrowLeftIcon, ArrowRightIcon, CheckIcon, UmbrellaIcon, ZapIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AddressSearch } from "@/components/address-search";
import { defaultWeek, HoursEditor, hoursFromWeek, validateWeek, weekFromHours, type WeekHours } from "@/components/host/hours-editor";
import { PhotoUploader } from "@/components/host/photo-uploader";
import { PriceSuggestion } from "@/components/host/price-suggestion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/fetcher";
import { money } from "@/lib/format";
import { summarizeHours } from "@/lib/opening-hours";
import type { ParkingLocation } from "@/lib/types";
import { cn } from "@/lib/utils";

const PinMap = dynamic(() => import("@/components/host/pin-map"), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-2xl bg-muted" />,
});

type HostType = "garage" | "lot" | "private";

interface Draft {
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
  name: string;
  description: string;
  type: HostType;
  total_spots: number;
  covered: boolean;
  ev_charging: boolean;
  accessible: boolean;
  photos: string[];
  always: boolean;
  week: WeekHours;
  blackout: string[];
  hourly_price: string;
}

const STEPS = ["Location", "Details", "Photos", "Availability", "Pricing", "Review"] as const;
const DRAFT_KEY = "parksmart:listing-draft";

function emptyDraft(): Draft {
  return {
    address: "", city: "", lat: null, lng: null, name: "", description: "", type: "private", total_spots: 1,
    covered: false, ev_charging: false, accessible: false, photos: [], always: true, week: defaultWeek(), blackout: [], hourly_price: "",
  };
}

function fromLocation(l: ParkingLocation): Draft {
  const { always, week } = weekFromHours(l.opening_hours);
  return {
    address: l.address ?? "", city: l.city ?? "", lat: l.lat, lng: l.lng, name: l.name, description: l.description ?? "",
    type: (l.type === "street" ? "lot" : l.type) as HostType, total_spots: l.total_spots, covered: l.covered, ev_charging: l.ev_charging,
    accessible: l.accessible, photos: l.photos, always, week, blackout: l.blackout_dates, hourly_price: String(Number(l.hourly_price)),
  };
}

export function ListingForm({ mode, location }: { mode: "create" | "edit"; location?: ParkingLocation }) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(() => (location ? fromLocation(location) : emptyDraft()));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((p) => ({ ...p, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  // Keep an unsent draft so a refresh doesn't lose work (create mode only).
  useEffect(() => {
    if (mode !== "create") return;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring an unsent draft after hydration
      if (saved) setD({ ...emptyDraft(), ...JSON.parse(saved) });
    } catch {
      /* ignore */
    }
  }, [mode]);
  useEffect(() => {
    if (mode !== "create") return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      /* ignore */
    }
  }, [d, mode]);

  function validate(s: number): boolean {
    const e: Record<string, string> = {};
    if (s === 0 && (d.lat === null || d.lng === null || !d.address)) e.address = "Search and choose your address";
    if (s === 1) {
      if (d.name.trim().length < 3) e.name = "Give your space a name (3+ characters)";
      if (!Number.isInteger(d.total_spots) || d.total_spots < 1 || d.total_spots > 500) e.total_spots = "Between 1 and 500 spaces";
      if (d.description.length > 1000) e.description = "Keep it under 1000 characters";
    }
    if (s === 3) {
      const w = validateWeek(d.always, d.week);
      if (w) e.week = w;
    }
    if (s === 4) {
      const p = Number(d.hourly_price);
      if (d.hourly_price === "" || Number.isNaN(p) || p < 0 || p > 100) e.hourly_price = "Enter an hourly price between $0 and $100";
    }
    setErrors(e);
    if (Object.keys(e).length) toast.error(Object.values(e)[0]);
    return Object.keys(e).length === 0;
  }

  function payload() {
    return {
      name: d.name.trim(),
      description: d.description.trim(),
      address: d.address,
      city: d.city,
      lat: d.lat!,
      lng: d.lng!,
      type: d.type,
      covered: d.covered,
      ev_charging: d.ev_charging,
      accessible: d.accessible,
      total_spots: d.total_spots,
      hourly_price: Math.round(Number(d.hourly_price) * 100) / 100,
      photos: d.photos,
      opening_hours: hoursFromWeek(d.always, d.week),
      blackout_dates: d.blackout,
    };
  }

  async function publish() {
    for (let s = 0; s < 5; s++) {
      if (!validate(s)) {
        if (mode === "create") setStep(s);
        return;
      }
    }
    setSaving(true);
    try {
      if (mode === "create") {
        const res = await api<{ location: { id: string } }>("/api/host/locations", { json: payload() });
        localStorage.removeItem(DRAFT_KEY);
        toast.success("Your space is live!", { description: "Drivers can find and book it now." });
        router.push(`/host/listings/${res.location.id}`);
        router.refresh();
      } else {
        await api(`/api/host/locations/${location!.id}`, { method: "PATCH", json: payload() });
        toast.success("Listing saved");
        router.refresh();
      }
    } catch (e) {
      toast.error(mode === "create" ? "Couldn't publish" : "Couldn't save", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  // ------------------------------------------------------------- sections
  const sections = [
    <section key="loc" className="space-y-4" aria-labelledby="sec-loc">
      <h2 id="sec-loc" className="text-xl font-semibold">Where is your space?</h2>
      <div className="space-y-1.5">
        <Label htmlFor="address">Address</Label>
        <AddressSearch
          id="address"
          defaultValue={d.address}
          invalid={Boolean(errors.address)}
          placeholder="Start typing the street address"
          onSelect={(p) => {
            setD((x) => ({ ...x, address: p.address || p.name, city: p.address.split(",")[1]?.trim() ?? "", lat: p.lat, lng: p.lng }));
            setErrors((e) => ({ ...e, address: "" }));
          }}
        />
        {errors.address && <p className="text-sm text-destructive">{errors.address}</p>}
      </div>
      {d.lat !== null && d.lng !== null && (
        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground">Drag the pin (or tap the map) to the exact entrance.</p>
          <PinMap lat={d.lat} lng={d.lng} onChange={(p) => setD((x) => ({ ...x, lat: p.lat, lng: p.lng }))} className="h-72 overflow-hidden rounded-2xl" />
        </div>
      )}
    </section>,

    <section key="details" className="space-y-5" aria-labelledby="sec-details">
      <h2 id="sec-details" className="text-xl font-semibold">Describe it</h2>
      <div className="space-y-1.5">
        <Label htmlFor="lname">Listing name</Label>
        <Input id="lname" value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Sunny driveway near Dolores Park" maxLength={80} aria-invalid={Boolean(errors.name) || undefined} />
        {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Type</legend>
        <div className="grid grid-cols-3 gap-2" role="radiogroup">
          {(
            [
              ["private", "Driveway / private"],
              ["garage", "Garage"],
              ["lot", "Lot"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={d.type === v}
              onClick={() => set("type", v)}
              className="min-h-14 rounded-xl border px-2 text-sm font-medium aria-checked:border-teal-strong aria-checked:bg-accent"
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="spots">Number of spaces</Label>
        <Input
          id="spots"
          type="number"
          inputMode="numeric"
          min={1}
          max={500}
          value={d.total_spots}
          onChange={(e) => set("total_spots", Math.floor(Number(e.target.value)))}
          aria-invalid={Boolean(errors.total_spots) || undefined}
          className="max-w-40"
        />
        {errors.total_spots && <p className="text-sm text-destructive">{errors.total_spots}</p>}
      </div>
      <div className="space-y-1">
        {(
          [
            ["covered", UmbrellaIcon, "Covered"],
            ["ev_charging", ZapIcon, "EV charging"],
            ["accessible", AccessibilityIcon, "Wheelchair accessible"],
          ] as const
        ).map(([k, Icon, label]) => (
          <label key={k} className="flex min-h-12 items-center justify-between rounded-xl px-1">
            <span className="flex items-center gap-2.5 text-sm">
              <Icon className="size-4 text-muted-foreground" /> {label}
            </span>
            <Switch checked={d[k]} onCheckedChange={(v) => set(k, v)} />
          </label>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="desc">Description & access instructions</Label>
        <Textarea id="desc" value={d.description} onChange={(e) => set("description", e.target.value)} rows={4} maxLength={1000} placeholder="Gate code is sent after booking. Fits a mid-size SUV." />
        <p className="text-right text-xs text-muted-foreground">{d.description.length}/1000</p>
      </div>
    </section>,

    <section key="photos" className="space-y-4" aria-labelledby="sec-photos">
      <h2 id="sec-photos" className="text-xl font-semibold">Add photos</h2>
      <PhotoUploader photos={d.photos} onChange={(p) => set("photos", p)} />
    </section>,

    <section key="avail" className="space-y-4" aria-labelledby="sec-avail">
      <h2 id="sec-avail" className="text-xl font-semibold">When can drivers park?</h2>
      <HoursEditor always={d.always} week={d.week} blackout={d.blackout} onChange={(v) => setD((x) => ({ ...x, ...v }))} />
      {errors.week && <p className="text-sm text-destructive">{errors.week}</p>}
    </section>,

    <section key="price" className="space-y-5" aria-labelledby="sec-price">
      <h2 id="sec-price" className="text-xl font-semibold">Set your price</h2>
      <div className="space-y-1.5">
        <Label htmlFor="price">Hourly price (USD)</Label>
        <div className="relative max-w-48">
          <span className="absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground">$</span>
          <Input
            id="price"
            type="number"
            inputMode="decimal"
            step="0.25"
            min={0}
            max={100}
            value={d.hourly_price}
            onChange={(e) => set("hourly_price", e.target.value)}
            className="pl-7"
            aria-invalid={Boolean(errors.hourly_price) || undefined}
          />
        </div>
        {errors.hourly_price && <p className="text-sm text-destructive">{errors.hourly_price}</p>}
      </div>
      {d.lat !== null && d.lng !== null ? (
        <PriceSuggestion
          request={
            mode === "edit" && location
              ? { location_id: location.id }
              : { lat: d.lat, lng: d.lng, type: d.type, covered: d.covered, ev_charging: d.ev_charging, total_spots: d.total_spots, current_price: d.hourly_price ? Number(d.hourly_price) : null }
          }
          currentPrice={d.hourly_price === "" ? null : Number(d.hourly_price)}
          onApply={(p) => {
            set("hourly_price", String(p));
            toast.success(`Price set to ${money(p)}/hr`, { description: mode === "edit" ? "Save to publish the change." : undefined });
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Add your address first to get an AI price suggestion.</p>
      )}
    </section>,
  ];

  if (mode === "edit") {
    return (
      <div className="space-y-10">
        {sections.map((s, i) => (
          <div key={i} className="rounded-2xl border bg-card p-5 shadow-soft sm:p-6">
            {s}
          </div>
        ))}
        <div className="sticky bottom-20 z-10 flex justify-end md:bottom-4">
          <Button size="lg" onClick={publish} loading={saving} className="shadow-lift">
            <CheckIcon /> Save changes
          </Button>
        </div>
      </div>
    );
  }

  const review = (
    <section className="space-y-4" aria-labelledby="sec-review">
      <h2 id="sec-review" className="text-xl font-semibold">Review & publish</h2>
      <dl className="divide-y rounded-2xl border bg-card text-sm">
        {[
          ["Name", d.name],
          ["Address", d.address],
          ["Type", d.type === "private" ? "Driveway / private" : d.type],
          ["Spaces", String(d.total_spots)],
          ["Amenities", [d.covered && "Covered", d.ev_charging && "EV charging", d.accessible && "Accessible"].filter(Boolean).join(", ") || "None"],
          ["Photos", `${d.photos.length}`],
          ["Hours", summarizeHours(hoursFromWeek(d.always, d.week))],
          ["Blocked dates", d.blackout.length ? `${d.blackout.length}` : "None"],
          ["Price", d.hourly_price === "" ? "Not set" : `${money(Number(d.hourly_price))}/hr`],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">By publishing you confirm you have the right to rent this space. You can pause the listing at any time.</p>
    </section>
  );

  return (
    <div className="space-y-8">
      <ol className="scrollbar-none flex gap-2 overflow-x-auto" aria-label="Listing steps">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => (i < step ? setStep(i) : undefined)}
              aria-current={i === step ? "step" : undefined}
              disabled={i > step}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap",
                i === step && "border-transparent bg-primary text-primary-foreground",
                i < step && "border-teal-strong text-teal-strong",
                i > step && "text-muted-foreground",
              )}
            >
              {i < step ? <CheckIcon className="size-3.5" /> : <span className="text-xs">{i + 1}</span>} {label}
            </button>
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
          {step < 5 ? sections[step] : review}
        </motion.div>
      </AnimatePresence>

      <div className="flex gap-2 border-t pt-6">
        {step > 0 && (
          <Button variant="outline" size="lg" onClick={() => setStep((s) => s - 1)} disabled={saving}>
            <ArrowLeftIcon /> Back
          </Button>
        )}
        {step < 5 ? (
          <Button size="lg" className="ml-auto" onClick={() => validate(step) && setStep((s) => s + 1)}>
            {step === 2 && d.photos.length === 0 ? "Skip for now" : "Continue"} <ArrowRightIcon />
          </Button>
        ) : (
          <Button variant="teal" size="lg" className="ml-auto" onClick={publish} loading={saving}>
            <CheckIcon /> Publish listing
          </Button>
        )}
      </div>
    </div>
  );
}
