"use client";

import { AlertTriangleIcon, InfoIcon, OctagonAlertIcon, RefreshCwIcon, SearchIcon, SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BookingStatusBadge } from "@/components/booking/status-badge";
import { EmptyState } from "@/components/empty-state";
import { LazyParkingMap, type Bounds } from "@/components/map/lazy-map";
import { useSession } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { api } from "@/lib/fetcher";
import { dateTime, money, relativeTime } from "@/lib/format";
import { SF_CENTER } from "@/lib/geo";
import { createClient } from "@/lib/supabase/client";
import type { BookingStatus, MapLocation, UserRole } from "@/lib/types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- live map
export function AdminLiveMap() {
  const [locations, setLocations] = useState<MapLocation[]>([]);
  const [selected, setSelected] = useState<MapLocation | null>(null);
  const [updates, setUpdates] = useState(0);

  const load = useCallback(async (b: Bounds) => {
    if (b.zoom < 9) return;
    const p = new URLSearchParams({ minLng: String(b.minLng), minLat: String(b.minLat), maxLng: String(b.maxLng), maxLat: String(b.maxLat) });
    try {
      const res = await api<{ locations: MapLocation[] }>(`/api/locations/bounds?${p}`);
      setLocations(res.locations);
    } catch (e) {
      toast.error("Couldn't load map data", { description: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel("admin-availability")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "parking_locations" }, (payload) => {
        const n = payload.new as MapLocation;
        setUpdates((u) => u + 1);
        setLocations((prev) => prev.map((l) => (l.id === n.id ? { ...l, available_now: n.available_now, availability_mode: n.availability_mode } : l)));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const live = locations.filter((l) => l.availability_mode === "live").length;
  const full = locations.filter((l) => (l.available_now ?? 1) <= 0).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span>{locations.length} locations in view</span>
        <span>{live} live</span>
        <span>{full} full</span>
        <span className="text-free">{updates} realtime updates this session</span>
      </div>
      <div className="relative h-[520px] overflow-hidden rounded-2xl border">
        <LazyParkingMap className="absolute inset-0" locations={locations} center={SF_CENTER} zoom={12} onBoundsChange={load} onSelect={(id) => setSelected(locations.find((l) => l.id === id) ?? null)} selectedId={selected?.id} />
        {selected && (
          <div className="absolute right-3 bottom-3 left-3 z-10 rounded-2xl border bg-card p-4 shadow-lift sm:left-auto sm:w-80">
            <p className="font-semibold">{selected.name}</p>
            <p className="text-sm text-muted-foreground">
              {selected.available_now ?? "?"} / {selected.total_spots} free · {selected.availability_mode ?? "unknown"} · {money(selected.hourly_price)}/hr
            </p>
            <div className="mt-3 flex gap-2">
              <a href={`/spots/${selected.id}`} className="text-sm font-medium text-teal-strong hover:underline">
                Open
              </a>
              <button className="text-sm text-muted-foreground hover:underline" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- bookings table
export interface AdminBooking {
  id: string;
  status: BookingStatus;
  start_time: string;
  end_time: string;
  total_price: number;
  refund_amount: number | null;
  checked_in_at: string | null;
  vehicle_plate: string | null;
  created_at: string;
  profile: { name: string | null } | null;
  location: { name: string } | null;
}

export function BookingsTable({ bookings }: { bookings: AdminBooking[] }) {
  const [status, setStatus] = useState<"all" | BookingStatus>("all");
  const [q, setQ] = useState("");
  const rows = useMemo(
    () =>
      bookings.filter(
        (b) =>
          (status === "all" || b.status === status) &&
          (!q || [b.id, b.location?.name, b.profile?.name, b.vehicle_plate].some((v) => v?.toLowerCase().includes(q.toLowerCase()))),
      ),
    [bookings, status, q],
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <SearchIcon className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search booking, driver, location, plate" className="pl-10" aria-label="Search bookings" />
        </div>
        <NativeSelect aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-48">
          <option value="all">All statuses</option>
          <option value="pending_payment">Awaiting payment</option>
          <option value="upcoming">Upcoming</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </NativeSelect>
      </div>
      {rows.length === 0 ? (
        <EmptyState art="calendar" title="No bookings match" className="rounded-2xl border py-8" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-muted-foreground">
              <tr>
                {["Booking", "Driver", "Location", "Start", "Status", "Checked in", "Amount"].map((h) => (
                  <th key={h} className={cn("px-4 py-3 font-medium whitespace-nowrap", h === "Amount" && "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="px-4 py-3 font-mono text-xs">
                    <a href={`/bookings/${b.id}`} className="hover:underline">
                      {b.id.slice(0, 8).toUpperCase()}
                    </a>
                  </td>
                  <td className="px-4 py-3">{b.profile?.name ?? "—"}</td>
                  <td className="max-w-48 truncate px-4 py-3">{b.location?.name ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{dateTime(b.start_time)}</td>
                  <td className="px-4 py-3"><BookingStatusBadge status={b.status} /></td>
                  <td className="px-4 py-3">{b.checked_in_at ? "Yes" : b.status === "completed" ? <span className="text-full">No-show</span> : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {money(Number(b.total_price))}
                    {b.refund_amount ? <span className="block text-xs text-muted-foreground">−{money(Number(b.refund_amount))}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- users
export interface AdminUser {
  id: string;
  name: string | null;
  role: UserRole;
  phone: string | null;
  vehicle_plate: string | null;
  created_at: string;
}

export function UsersTable({ users }: { users: AdminUser[] }) {
  const { profile } = useSession();
  const router = useRouter();
  const [list, setList] = useState(users);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");

  async function changeRole(u: AdminUser, role: UserRole) {
    if (u.id === profile?.id && role !== "admin") {
      toast.error("You can't remove your own admin role");
      return;
    }
    setBusy(u.id);
    const { error } = await createClient().from("profiles").update({ role }).eq("id", u.id);
    setBusy(null);
    if (error) return toast.error("Couldn't change role", { description: error.message });
    setList((l) => l.map((x) => (x.id === u.id ? { ...x, role } : x)));
    toast.success(`${u.name ?? "User"} is now ${role}`);
    router.refresh();
  }

  const rows = list.filter((u) => !q || (u.name ?? "").toLowerCase().includes(q.toLowerCase()) || u.id.startsWith(q));
  return (
    <div className="space-y-3">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or id" aria-label="Search users" className="max-w-sm" />
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Plate</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium">Role</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="px-4 py-3">
                  <p className="font-medium">{u.name ?? "—"}</p>
                  <p className="font-mono text-xs text-muted-foreground">{u.id.slice(0, 8)}</p>
                </td>
                <td className="px-4 py-3 font-mono">{u.vehicle_plate ?? "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap">{relativeTime(u.created_at)}</td>
                <td className="px-4 py-3">
                  <NativeSelect
                    aria-label={`Role for ${u.name ?? u.id}`}
                    value={u.role}
                    disabled={busy === u.id}
                    onChange={(e) => changeRole(u, e.target.value as UserRole)}
                    className="w-32 [&_select]:h-9"
                  >
                    <option value="driver">Driver</option>
                    <option value="host">Host</option>
                    <option value="admin">Admin</option>
                  </NativeSelect>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- AI insights
interface Insight {
  id: string;
  for_date: string;
  model: string;
  created_at: string;
  summary: {
    headline: string;
    peak_hours: string;
    busiest_lots: string[];
    revenue_trend: string;
    anomalies: { title: string; detail: string; severity: "info" | "warning" | "critical" }[];
    recommendations: string[];
  };
}

const SEVERITY = {
  info: { icon: InfoIcon, label: "Info", cls: "border-border bg-muted/50" },
  warning: { icon: AlertTriangleIcon, label: "Warning", cls: "border-filling/50 bg-filling/10" },
  critical: { icon: OctagonAlertIcon, label: "Critical", cls: "border-full/50 bg-full/10" },
} as const;

export function InsightsPanel({ initial }: { initial: Insight | null }) {
  const [insight, setInsight] = useState(initial);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const res = await api<{ insight: Insight }>("/api/ai/insights", { json: {} });
      setInsight(res.insight);
      toast.success("Insights generated");
    } catch (e) {
      toast.error("Couldn't generate insights", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {insight ? `Generated ${relativeTime(insight.created_at)} for ${insight.for_date} · ${insight.model === "rules" ? "rule-based" : insight.model}` : "No insights generated yet."}
        </p>
        <Button variant="teal" onClick={generate} loading={loading}>
          {insight ? <RefreshCwIcon /> : <SparklesIcon />} {insight ? "Regenerate" : "Generate today's insights"}
        </Button>
      </div>
      {insight && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-navy p-6 text-white">
            <p className="flex items-center gap-2 text-sm text-teal">
              <SparklesIcon className="size-4" /> AI daily briefing
            </p>
            <p className="mt-2 text-xl font-semibold">{insight.summary.headline}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <InsightCard title="Peak hours">{insight.summary.peak_hours}</InsightCard>
            <InsightCard title="Revenue trend">{insight.summary.revenue_trend}</InsightCard>
            <InsightCard title="Busiest lots">
              {insight.summary.busiest_lots.length ? (
                <ol className="list-decimal space-y-1 pl-4">
                  {insight.summary.busiest_lots.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ol>
              ) : (
                "No bookings yet"
              )}
            </InsightCard>
          </div>
          <div>
            <h3 className="mb-2 font-semibold">Anomalies</h3>
            {insight.summary.anomalies.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing unusual detected.</p>
            ) : (
              <ul className="space-y-2">
                {insight.summary.anomalies.map((a) => {
                  const s = SEVERITY[a.severity];
                  return (
                    <li key={a.title} className={cn("flex gap-3 rounded-xl border p-3 text-sm", s.cls)}>
                      <s.icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <div>
                        <p className="font-medium">
                          <span className="sr-only">{s.label}: </span>
                          {a.title} <span className="ml-1 text-xs font-normal text-muted-foreground">({s.label})</span>
                        </p>
                        <p className="text-muted-foreground">{a.detail}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 font-semibold">Recommendations</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {insight.summary.recommendations.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function InsightCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-4 text-sm shadow-soft">
      <p className="mb-1.5 font-semibold">{title}</p>
      <div className="text-muted-foreground">{children}</div>
    </div>
  );
}
