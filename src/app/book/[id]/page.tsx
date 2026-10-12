import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingForm } from "@/components/booking/booking-form";
import { AvailabilityBadge } from "@/components/parking/availability";
import { requirePageRole } from "@/lib/auth";
import { money, TYPE_LABEL } from "@/lib/format";
import type { ParkingLocation, Vehicle } from "@/lib/types";

export const metadata: Metadata = { title: "Reserve parking" };

export default async function BookPage(props: PageProps<"/book/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const { supabase, profile } = await requirePageRole(null, `/book/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [{ data: loc }, { data: vehicles }] = await Promise.all([
    supabase.from("parking_locations").select("*").eq("id", id).eq("is_active", true).maybeSingle<ParkingLocation>(),
    supabase.from("vehicles").select("*").eq("user_id", profile.id).order("is_default", { ascending: false }),
  ]);
  if (!loc) notFound();
  const str = (v: unknown) => (typeof v === "string" ? v : null);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 pb-28 sm:px-6">
      <Link href={`/spots/${loc.id}`} className="text-sm text-muted-foreground hover:text-foreground">
        ← {loc.name}
      </Link>
      <h1 className="mt-3 text-3xl font-bold">Reserve your space</h1>
      <div className="mt-2 mb-8 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>{TYPE_LABEL[loc.type]}</span>·<span>{Number(loc.hourly_price) === 0 ? "Free" : `${money(Number(loc.hourly_price))}/hr`}</span>
        <AvailabilityBadge available={loc.available_now} total={loc.total_spots} mode={loc.availability_mode} />
      </div>
      <BookingForm
        location={{ id: loc.id, name: loc.name, hourly_price: Number(loc.hourly_price), timezone: loc.timezone }}
        vehicles={(vehicles ?? []) as Vehicle[]}
        defaultPlate={profile.vehicle_plate}
        initialStart={str(sp.start)}
        initialHours={str(sp.hours) ? Number(sp.hours) : null}
        cancelledBookingId={str(sp.cancelled)}
      />
    </div>
  );
}
