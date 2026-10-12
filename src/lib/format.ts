export function money(amount: number | null | undefined, opts: { compact?: boolean } = {}) {
  const value = Number(amount ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.compact && Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function distance(meters: number) {
  const miles = meters / 1609.344;
  if (miles < 0.1) return `${Math.round(meters * 3.28084)} ft`;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

/** Walking time at ~4.8 km/h with a 1.3x street-grid detour factor. */
export function walkMinutes(meters: number) {
  return Math.max(1, Math.round((meters * 1.3) / 80));
}

export function duration(hours: number) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function percent(p: number) {
  return `${Math.round(p * 100)}%`;
}

const TZ = "America/Los_Angeles";

export function dateTime(iso: string, tz = TZ) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function time(iso: string, tz = TZ) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function shortDate(iso: string, tz = TZ) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(new Date(iso));
}

export function relativeTime(iso: string) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export function countdown(ms: number) {
  if (ms <= 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export const TYPE_LABEL = {
  garage: "Garage",
  lot: "Surface lot",
  street: "Street meters",
  private: "Private space",
} as const;

export function normalizePlate(plate: string) {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
