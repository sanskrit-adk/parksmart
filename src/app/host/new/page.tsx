import type { Metadata } from "next";
import Link from "next/link";
import { ListingForm } from "@/components/host/listing-form";
import { requirePageRole } from "@/lib/auth";

export const metadata: Metadata = { title: "List your space" };

export default async function NewListingPage() {
  await requirePageRole(null, "/host/new");
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 pb-28 sm:px-6">
      <Link href="/host" className="text-sm text-muted-foreground hover:text-foreground">
        ← Host dashboard
      </Link>
      <h1 className="mt-3 text-3xl font-bold">List your space</h1>
      <p className="mt-2 mb-8 text-muted-foreground">About 3 minutes. AI suggests a price that fits your neighbourhood.</p>
      <ListingForm mode="create" />
    </div>
  );
}
