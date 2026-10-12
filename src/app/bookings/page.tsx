import { ScanLineIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookingsTabs } from "@/components/booking/bookings-tabs";
import { buttonVariants } from "@/components/ui/button";
import { requirePageRole } from "@/lib/auth";
import { listUserBookings } from "@/lib/booking-queries";

export const metadata: Metadata = { title: "My bookings" };

export default async function BookingsPage() {
  const { supabase, profile } = await requirePageRole(null, "/bookings");
  const bookings = await listUserBookings(supabase, profile.id);
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 pb-28 sm:px-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">My bookings</h1>
          <p className="mt-1 text-muted-foreground">Extend, cancel, navigate or rate. Everything updates live.</p>
        </div>
        <Link href="/check-in" className={buttonVariants({ variant: "outline" })}>
          <ScanLineIcon /> <span className="hidden sm:inline">Plate check-in</span>
        </Link>
      </div>
      <Suspense>
        <BookingsTabs bookings={bookings} userId={profile.id} />
      </Suspense>
    </div>
  );
}
