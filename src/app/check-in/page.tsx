import type { Metadata } from "next";
import { PlateCheckin } from "@/components/checkin/plate-checkin";
import { requirePageRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Plate check-in" };

export default async function CheckInPage() {
  await requirePageRole(null, "/check-in");
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8 pb-28 sm:px-6">
      <h1 className="text-3xl font-bold">Check in with your plate</h1>
      <p className="mt-2 mb-6 text-muted-foreground">
        Arrived? Scan your licence plate. AI reads it, matches your booking and starts it automatically.
      </p>
      <PlateCheckin />
    </div>
  );
}
