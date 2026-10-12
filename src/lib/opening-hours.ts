import type { DayKey, OpeningHours } from "@/lib/types";

export const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

export function summarizeHours(hours: OpeningHours | null): string {
  if (!hours) return "Hours not listed";
  if ("always" in hours && hours.always) return "Open 24/7";
  const parts: string[] = [];
  for (const { key, label } of DAYS) {
    const ranges = (hours as Partial<Record<DayKey, [string, string][]>>)[key];
    if (!ranges?.length) parts.push(`${label}: closed`);
    else parts.push(`${label}: ${ranges.map(([a, b]) => (a === b ? "24h" : `${a}–${b}`)).join(", ")}`);
  }
  return parts.join(" · ");
}

/**
 * Parses the common subset of the OSM opening_hours syntax ("24/7",
 * "Mo-Fr 07:00-22:00; Sa,Su 08:00-20:00"). Returns null when the
 * expression is more complex than we can represent faithfully.
 */
export function parseOsmOpeningHours(value: string | undefined): OpeningHours | null {
  if (!value) return null;
  const v = value.trim();
  if (v === "24/7") return { always: true };
  const osmDays = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const result: Partial<Record<DayKey, [string, string][]>> = {};
  for (const rule of v.split(";").map((r) => r.trim()).filter(Boolean)) {
    const m = rule.match(/^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:[-,](?:Mo|Tu|We|Th|Fr|Sa|Su))*)\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    if (!m) return null;
    const days = new Set<number>();
    for (const part of m[1].split(",")) {
      const [a, b] = part.split("-");
      const ia = osmDays.indexOf(a);
      const ib = b ? osmDays.indexOf(b) : ia;
      for (let i = ia; ; i = (i + 1) % 7) {
        days.add(i);
        if (i === ib) break;
      }
    }
    const close = m[3] === "24:00" ? "00:00" : m[3];
    for (const i of days) {
      const key = DAYS[i].key;
      (result[key] ??= []).push([m[2], close]);
    }
  }
  return Object.keys(result).length ? result : null;
}
