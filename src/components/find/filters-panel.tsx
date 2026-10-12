"use client";

import { AccessibilityIcon, ClockIcon, UmbrellaIcon, ZapIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { TYPE_LABEL } from "@/lib/format";
import type { LocationType, SearchFilters } from "@/lib/types";

export type EditableFilters = Pick<
  SearchFilters,
  "radius_m" | "duration_hours" | "arrive_at" | "max_price_per_hour" | "covered" | "ev_charging" | "accessible" | "open_now" | "types" | "sort"
>;

export const DURATIONS = [0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 24];
export const RADII = [400, 800, 1200, 2000, 3000, 5000];

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function FiltersPanel({ value, onApply, onCancel }: { value: EditableFilters; onApply: (f: EditableFilters) => void; onCancel?: () => void }) {
  const [f, setF] = useState<EditableFilters>(value);
  const [timeError, setTimeError] = useState<string | null>(null);
  const set = <K extends keyof EditableFilters>(k: K, v: EditableFilters[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const maxPrice = f.max_price_per_hour ?? 0;

  function apply() {
    if (f.arrive_at && new Date(f.arrive_at).getTime() < Date.now() - 10 * 60_000) {
      setTimeError("Arrival time can't be in the past");
      return;
    }
    onApply(f);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <Label htmlFor="price">Max price per hour</Label>
          <span className="text-sm font-semibold">{maxPrice === 0 ? "Any" : `$${maxPrice}`}</span>
        </div>
        <Slider
          id="price"
          aria-label="Maximum price per hour"
          min={0}
          max={30}
          step={1}
          value={[maxPrice]}
          onValueChange={(v) => {
            const n = Array.isArray(v) ? v[0] : v;
            set("max_price_per_hour", n === 0 ? null : n);
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="radius">Distance</Label>
          <NativeSelect id="radius" value={f.radius_m} onChange={(e) => set("radius_m", Number(e.target.value))}>
            {RADII.map((r) => (
              <option key={r} value={r}>
                Within {r < 1000 ? `${Math.round(r * 3.28)} ft` : `${(r / 1609).toFixed(1)} mi`}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="duration">Duration</Label>
          <NativeSelect id="duration" value={f.duration_hours} onChange={(e) => set("duration_hours", Number(e.target.value))}>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d < 1 ? "30 min" : `${d} hour${d > 1 ? "s" : ""}`}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="arrive">
          <ClockIcon className="size-4" /> Arrival time
        </Label>
        <div className="flex gap-2">
          <input
            id="arrive"
            type="datetime-local"
            value={toLocalInput(f.arrive_at)}
            min={toLocalInput(new Date().toISOString())}
            onChange={(e) => {
              setTimeError(null);
              set("arrive_at", e.target.value ? new Date(e.target.value).toISOString() : null);
            }}
            aria-invalid={Boolean(timeError) || undefined}
            aria-describedby={timeError ? "arrive-error" : undefined}
            className="h-11 flex-1 rounded-xl border border-input bg-card px-3.5 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm"
          />
          {f.arrive_at && (
            <Button variant="outline" onClick={() => set("arrive_at", null)}>
              Now
            </Button>
          )}
        </div>
        {timeError ? (
          <p id="arrive-error" className="text-xs text-destructive">{timeError}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Predictions are calculated for when you arrive.</p>
        )}
      </div>

      <fieldset className="space-y-1">
        <legend className="mb-2 text-sm font-medium">Amenities</legend>
        <Toggle icon={UmbrellaIcon} label="Covered" checked={!!f.covered} onChange={(v) => set("covered", v || null)} />
        <Toggle icon={ZapIcon} label="EV charging" checked={!!f.ev_charging} onChange={(v) => set("ev_charging", v || null)} />
        <Toggle icon={AccessibilityIcon} label="Wheelchair accessible" checked={!!f.accessible} onChange={(v) => set("accessible", v || null)} />
        <Toggle icon={ClockIcon} label="Open at arrival time" checked={f.open_now} onChange={(v) => set("open_now", v)} />
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Parking type</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TYPE_LABEL) as LocationType[]).map((t) => {
            const active = f.types?.includes(t) ?? false;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  const next = active ? (f.types ?? []).filter((x) => x !== t) : [...(f.types ?? []), t];
                  set("types", next.length ? next : null);
                }}
                className="rounded-full border px-3.5 py-2 text-sm font-medium transition-colors aria-pressed:border-teal-strong aria-pressed:bg-accent aria-pressed:text-accent-foreground"
              >
                {TYPE_LABEL[t]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="sticky bottom-0 flex gap-2 bg-popover pt-2">
        <Button
          variant="outline"
          size="lg"
          className="flex-1"
          onClick={() => {
            const reset: EditableFilters = { ...f, max_price_per_hour: null, covered: null, ev_charging: null, accessible: null, open_now: false, types: null, arrive_at: null, radius_m: 2000 };
            setF(reset);
            onApply(reset);
            onCancel?.();
          }}
        >
          Reset
        </Button>
        <Button size="lg" className="flex-1" onClick={apply}>
          Show results
        </Button>
      </div>
    </div>
  );
}

function Toggle({ icon: Icon, label, checked, onChange }: { icon: typeof ZapIcon; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl px-1">
      <span className="flex items-center gap-2.5 text-sm">
        <Icon className="size-4 text-muted-foreground" aria-hidden /> {label}
      </span>
      <Switch checked={checked} onCheckedChange={(v) => onChange(v)} />
    </label>
  );
}
