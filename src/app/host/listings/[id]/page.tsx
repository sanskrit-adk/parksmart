import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DetectionUploader } from "@/components/ai/detection-uploader";
import { ApplyPriceSuggestion, ListingActiveToggle } from "@/components/host/host-client";
import { ListingForm } from "@/components/host/listing-form";
import { AvailabilityBadge } from "@/components/parking/availability";
import { ForecastChart } from "@/components/parking/forecast-chart";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageRole } from "@/lib/auth";
import { money } from "@/lib/format";
import type { AiDetection, ParkingLocation } from "@/lib/types";
import { HostListingTabs } from "./tabs";

export const metadata: Metadata = { title: "Manage listing" };

export default async function ManageListingPage(props: PageProps<"/host/listings/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const { supabase, profile } = await requirePageRole(["host", "admin"], `/host/listings/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: loc } = await supabase.from("parking_locations").select("*").eq("id", id).maybeSingle<ParkingLocation>();
  if (!loc || (loc.host_id !== profile.id && profile.role !== "admin")) notFound();

  const since = daysAgo(30);
  const [{ data: detections }, { data: recent }] = await Promise.all([
    supabase.from("ai_detections").select("*").eq("location_id", id).order("created_at", { ascending: false }).limit(5),
    supabase.from("bookings").select("total_price, status").eq("location_id", id).gte("start_time", since).in("status", ["upcoming", "active", "completed"]),
  ]);
  const revenue = (recent ?? []).reduce((s, b) => s + Number(b.total_price), 0);
  const tab = typeof sp.tab === "string" ? sp.tab : "overview";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 pb-28 sm:px-6">
      <Link href="/host" className="text-sm text-muted-foreground hover:text-foreground">
        ← Host dashboard
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{loc.name}</h1>
          <p className="text-muted-foreground">{loc.address}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <AvailabilityBadge available={loc.available_now} total={loc.total_spots} mode={loc.availability_mode} />
            <ListingActiveToggle id={loc.id} active={loc.is_active} />
          </div>
        </div>
        <Link href={`/spots/${loc.id}`} className={buttonVariants({ variant: "outline" })}>
          View public page
        </Link>
      </div>

      <HostListingTabs
        initial={["overview", "pricing", "camera", "edit"].includes(tab) ? tab : "overview"}
        overview={
          <div className="grid gap-4 md:grid-cols-3">
            <Stat label="Price" value={`${money(Number(loc.hourly_price))}/hr`} />
            <Stat label="Bookings (30 days)" value={String(recent?.length ?? 0)} />
            <Stat label="Revenue (30 days)" value={money(revenue)} />
            <Card className="md:col-span-3">
              <CardHeader>
                <CardTitle>Demand forecast</CardTitle>
              </CardHeader>
              <CardContent>
                <ForecastChart locationId={loc.id} timezone={loc.timezone} />
              </CardContent>
            </Card>
          </div>
        }
        pricing={<ApplyPriceSuggestion locationId={loc.id} currentPrice={Number(loc.hourly_price)} />}
        camera={
          <Card>
            <CardHeader>
              <CardTitle>Camera spot detection</CardTitle>
            </CardHeader>
            <CardContent>
              <DetectionUploader locations={[{ id: loc.id, name: loc.name }]} initialLocationId={loc.id} recent={(detections ?? []) as AiDetection[]} />
            </CardContent>
          </Card>
        }
        edit={<ListingForm mode="edit" location={loc} />}
      />
    </div>
  );
}

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-soft">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
