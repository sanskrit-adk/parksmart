import { HeartIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { FavoriteButton } from "@/components/parking/favorite-button";
import { AiPreferences, ProfileDetails, VehiclesCard } from "@/components/profile/profile-forms";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageRole } from "@/lib/auth";
import { money, TYPE_LABEL } from "@/lib/format";
import type { Vehicle } from "@/lib/types";

export const metadata: Metadata = { title: "Profile" };

interface FavRow {
  location: { id: string; name: string; address: string | null; type: keyof typeof TYPE_LABEL; hourly_price: number } | null;
}

export default async function ProfilePage() {
  const { supabase, profile, user } = await requirePageRole(null, "/profile");
  const [{ data: vehicles }, { data: favs }] = await Promise.all([
    supabase.from("vehicles").select("*").eq("user_id", profile.id).order("created_at"),
    supabase.from("favorites").select("location:parking_locations(id, name, address, type, hourly_price)").eq("user_id", profile.id).order("created_at", { ascending: false }),
  ]);
  const favorites = ((favs ?? []) as unknown as FavRow[]).map((f) => f.location).filter((l): l is NonNullable<FavRow["location"]> => Boolean(l));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 pb-28 sm:px-6">
      <h1 className="text-3xl font-bold">Profile</h1>
      <ProfileDetails profile={profile} email={user.email ?? ""} />
      <VehiclesCard userId={profile.id} initial={(vehicles ?? []) as Vehicle[]} />
      <AiPreferences profile={profile} />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HeartIcon className="size-4 text-full" /> Favorites
          </CardTitle>
          <CardDescription>Your saved parking spots.</CardDescription>
        </CardHeader>
        <CardContent>
          {favorites.length === 0 ? (
            <EmptyState
              art="map"
              title="No favorites yet"
              description="Tap the heart on any spot to save it here."
              action={
                <Link href="/find" className={buttonVariants({ variant: "outline" })}>
                  Explore parking
                </Link>
              }
              className="py-6"
            />
          ) : (
            <ul className="divide-y">
              {favorites.map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/spots/${l.id}`} className="font-medium hover:underline">
                      {l.name}
                    </Link>
                    <p className="truncate text-sm text-muted-foreground">
                      {TYPE_LABEL[l.type]} · {Number(l.hourly_price) === 0 ? "Free" : `${money(Number(l.hourly_price))}/hr`}
                      {l.address ? ` · ${l.address}` : ""}
                    </p>
                  </div>
                  <Link href={`/book/${l.id}`} className={buttonVariants({ size: "sm" })}>
                    Book
                  </Link>
                  <FavoriteButton locationId={l.id} initial />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
