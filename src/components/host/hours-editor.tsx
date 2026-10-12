"use client";

import { XIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { DAYS } from "@/lib/opening-hours";
import type { DayKey, OpeningHours } from "@/lib/types";

export type WeekHours = Record<DayKey, { open: boolean; from: string; to: string }>;

export function defaultWeek(): WeekHours {
  return Object.fromEntries(DAYS.map(({ key }) => [key, { open: true, from: "07:00", to: "22:00" }])) as WeekHours;
}

export function weekFromHours(h: OpeningHours | null): { always: boolean; week: WeekHours } {
  if (!h || ("always" in h && h.always)) return { always: true, week: defaultWeek() };
  const week = defaultWeek();
  for (const { key } of DAYS) {
    const r = (h as Partial<Record<DayKey, [string, string][]>>)[key];
    week[key] = r?.length ? { open: true, from: r[0][0], to: r[0][1] } : { open: false, from: "07:00", to: "22:00" };
  }
  return { always: false, week };
}

export function hoursFromWeek(always: boolean, week: WeekHours): OpeningHours {
  if (always) return { always: true };
  const out: Partial<Record<DayKey, [string, string][]>> = {};
  for (const { key } of DAYS) if (week[key].open) out[key] = [[week[key].from, week[key].to]];
  return out;
}

export function validateWeek(always: boolean, week: WeekHours): string | null {
  if (always) return null;
  if (!DAYS.some(({ key }) => week[key].open)) return "Open at least one day, or choose 24/7";
  for (const { key, label } of DAYS) {
    const d = week[key];
    if (d.open && d.from === d.to) return `${label}: opening and closing times are the same`;
  }
  return null;
}

/** Availability calendar: weekly hours + specific blocked dates. */
export function HoursEditor({
  always,
  week,
  blackout,
  onChange,
}: {
  always: boolean;
  week: WeekHours;
  blackout: string[];
  onChange: (v: { always: boolean; week: WeekHours; blackout: string[] }) => void;
}) {
  const setDay = (k: DayKey, patch: Partial<WeekHours[DayKey]>) => onChange({ always, blackout, week: { ...week, [k]: { ...week[k], ...patch } } });
  const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-6">
      <label className="flex min-h-12 items-center justify-between rounded-xl border px-4">
        <span className="text-sm font-medium">Available 24/7</span>
        <Switch checked={always} onCheckedChange={(v) => onChange({ always: v, week, blackout })} />
      </label>

      {!always && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Weekly hours</legend>
          {DAYS.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-3 rounded-xl border px-3 py-2">
              <Switch checked={week[key].open} onCheckedChange={(v) => setDay(key, { open: v })} aria-label={`Open on ${label}`} />
              <span className="w-10 text-sm font-medium">{label}</span>
              {week[key].open ? (
                <div className="flex flex-1 items-center gap-2 text-sm">
                  <input
                    type="time"
                    aria-label={`${label} opens`}
                    value={week[key].from}
                    onChange={(e) => setDay(key, { from: e.target.value })}
                    className="h-10 flex-1 rounded-lg border bg-card px-2"
                  />
                  <span aria-hidden>–</span>
                  <input
                    type="time"
                    aria-label={`${label} closes`}
                    value={week[key].to}
                    onChange={(e) => setDay(key, { to: e.target.value })}
                    className="h-10 flex-1 rounded-lg border bg-card px-2"
                  />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Closed</span>
              )}
            </div>
          ))}
        </fieldset>
      )}

      <div>
        <p className="mb-1 text-sm font-medium">Blocked dates</p>
        <p className="mb-3 text-xs text-muted-foreground">Tap dates when your space isn&apos;t available (e.g. you need the driveway).</p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Calendar
            mode="multiple"
            selected={blackout.map((d) => new Date(`${d}T12:00:00`))}
            onSelect={(dates) => onChange({ always, week, blackout: (dates ?? []).map(toIso).sort() })}
            disabled={{ before: today }}
            className="rounded-2xl border"
          />
          {blackout.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {blackout.map((d) => (
                <li key={d}>
                  <button
                    type="button"
                    onClick={() => onChange({ always, week, blackout: blackout.filter((x) => x !== d) })}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs"
                    aria-label={`Unblock ${d}`}
                  >
                    {new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })} <XIcon className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
