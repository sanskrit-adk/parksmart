import { BanIcon, CalendarCheckIcon, CameraIcon, DollarSignIcon, UserPlusIcon, UserXIcon } from "lucide-react";
import type { Metadata } from "next";
import { AdminCharts } from "@/components/admin/admin-charts";
import { AdminLiveMap, BookingsTable, InsightsPanel, UsersTable, type AdminBooking, type AdminUser } from "@/components/admin/admin-panels";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { DetectionUploader, DetectionView } from "@/components/ai/detection-uploader";
import { requirePageRole } from "@/lib/auth";
import { money } from "@/lib/format";
import type { AiDetection } from "@/lib/types";

export const metadata: Metadata = { title: "Admin" };

interface Metrics {
  bookings: number;
  cancelled: number;
  revenue: number;
  no_shows: number;
  abandoned_checkouts: number;
  cv_detections: number;
  new_users: number;
  occupancy_by_hour: { hour: number; rate: number }[];
  bookings_by_hour: { hour: number; count: number }[];
  revenue_trend: { day: string; revenue: number }[];
}

export default async function AdminPage() {
  const { supabase } = await requirePageRole(["admin"], "/admin");
  const [{ data: metrics }, { data: bookings }, { data: users }, { data: insight }, { data: camLocations }, { data: detections }] = await Promise.all([
    supabase.rpc("admin_daily_metrics"),
    supabase
      .from("bookings")
      .select("id, status, start_time, end_time, total_price, refund_amount, checked_in_at, vehicle_plate, created_at, profile:profiles(name), location:parking_locations(name)")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("profiles").select("id, name, role, phone, vehicle_plate, created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("ai_insights").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("parking_locations").select("id, name").in("type", ["garage", "lot", "private"]).eq("is_active", true).order("name").limit(500),
    supabase.from("ai_detections").select("*").order("created_at", { ascending: false }).limit(6),
  ]);
  const m = (metrics ?? {}) as Partial<Metrics>;
  const dets = (detections ?? []) as AiDetection[];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 pb-28 sm:px-6">
      <div>
        <h1 className="text-3xl font-bold">Admin dashboard</h1>
        <p className="mt-1 text-muted-foreground">Today across ParkSmart (Pacific time).</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={CalendarCheckIcon} label="Bookings today" value={String(m.bookings ?? 0)} />
        <Kpi icon={DollarSignIcon} label="Net revenue today" value={money(Number(m.revenue ?? 0))} />
        <Kpi icon={UserXIcon} label="No-shows" value={String(m.no_shows ?? 0)} />
        <Kpi icon={BanIcon} label="Cancellations" value={String(m.cancelled ?? 0)} />
        <Kpi icon={CameraIcon} label="CV detections" value={String(m.cv_detections ?? 0)} />
        <Kpi icon={UserPlusIcon} label="New users" value={String(m.new_users ?? 0)} />
      </div>

      <AdminTabs
        panels={[
          { value: "insights", label: "AI insights", content: <InsightsPanel initial={insight ?? null} /> },
          {
            value: "overview",
            label: "Occupancy & revenue",
            content: <AdminCharts occupancy={m.occupancy_by_hour ?? []} bookingsByHour={m.bookings_by_hour ?? []} revenueTrend={m.revenue_trend ?? []} />,
          },
          { value: "map", label: "Live map", content: <AdminLiveMap /> },
          { value: "bookings", label: "Bookings", content: <BookingsTable bookings={(bookings ?? []) as unknown as AdminBooking[]} /> },
          { value: "users", label: "Users", content: <UsersTable users={(users ?? []) as AdminUser[]} /> },
          {
            value: "camera",
            label: "Camera detection",
            content: (
              <div className="space-y-8">
                <DetectionUploader locations={camLocations ?? []} />
                {dets.length > 0 && (
                  <section>
                    <h2 className="mb-3 font-semibold">Recent detections</h2>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {dets.map((d) => (
                        <div key={d.id} className="rounded-2xl border bg-card p-3">
                          <DetectionView detection={d} />
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof CameraIcon; label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-soft">
      <Icon className="size-5 text-teal-strong" aria-hidden />
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
