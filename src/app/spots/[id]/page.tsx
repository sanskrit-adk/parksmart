import { AccessibilityIcon, ClockIcon, DatabaseIcon, InfoIcon, MapPinIcon, StarIcon, UmbrellaIcon, UsersIcon, ZapIcon } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { AvailabilityBadge, PredictionPill } from "@/components/parking/availability";
import { DirectionsButton } from "@/components/parking/directions-button";
import { FavoriteButton } from "@/components/parking/favorite-button";
import { ForecastChart } from "@/components/parking/forecast-chart";
import { DistanceFromYou, ShareButton } from "@/components/parking/spot-client-bits";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { money, relativeTime, TYPE_LABEL } from "@/lib/format";
import { summarizeHours } from "@/lib/opening-hours";
import { staticMapUrl } from "@/lib/static-map";
import type { ParkingLocation, Review } from "@/lib/types";
import { cn } from "@/lib/utils";

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { supabase, user } = await getSession();
  const { data: loc } = await supabase.from("parking_locations").select("*").eq("id", id).maybeSingle<ParkingLocation>();
  if (!loc) return null;
  const [{ data: reviews }, fav, { data: prob }] = await Promise.all([
    supabase.from("reviews").select("*").eq("location_id", id).order("created_at", { ascending: false }).limit(20),
    user ? supabase.from("favorites").select("location_id").eq("user_id", user.id).eq("location_id", id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.rpc("location_forecast", { p_location_id: id, p_hours: 1 }),
  ]);
  return {
    loc: { ...loc, hourly_price: Number(loc.hourly_price), rating: loc.rating === null ? null : Number(loc.rating) },
    reviews: (reviews ?? []) as Review[],
    favorite: Boolean(fav.data),
    probability: prob?.[0] ? Number(prob[0].free_probability) : null,
  };
}

export async function generateMetadata(props: PageProps<"/spots/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const data = await load(id);
  if (!data) return { title: "Parking not found" };
  return {
    title: data.loc.name,
    description: `${TYPE_LABEL[data.loc.type]} parking${data.loc.address ? ` at ${data.loc.address}` : ""} — ${money(data.loc.hourly_price)}/hr with AI availability forecast.`,
  };
}

export default async function SpotPage(props: PageProps<"/spots/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const data = await load(id);
  if (!data) notFound();
  const { loc, reviews, favorite, probability } = data;
  const start = typeof sp.start === "string" ? sp.start : null;
  const bookHref = `/book/${loc.id}${start ? `?start=${encodeURIComponent(start)}` : ""}`;
  const photo = loc.photos[0] ?? staticMapUrl(loc.lat, loc.lng);
  const sourceLabel =
    loc.source === "osm" ? "OpenStreetMap" : loc.source === "sfmta" ? "SFMTA parking meters (DataSF)" : "Listed by a ParkSmart host";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-40 sm:px-6 md:pb-16">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
        <Link href="/find" className="hover:text-foreground">
          Find parking
        </Link>{" "}
        / <span className="text-foreground">{loc.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-8">
          <div className="relative overflow-hidden rounded-3xl bg-muted">
            {photo ? (
              <Image
                src={photo}
                alt={loc.photos[0] ? `Photo of ${loc.name}` : `Map of ${loc.name}`}
                width={1600}
                height={840}
                priority
                unoptimized={!loc.photos[0]}
                className="aspect-[16/8] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[16/8] items-center justify-center text-muted-foreground">
                <MapPinIcon className="size-10" />
              </div>
            )}
            {loc.photos.length > 1 && (
              <div className="scrollbar-none absolute right-3 bottom-3 left-3 flex gap-2 overflow-x-auto">
                {loc.photos.slice(1, 6).map((p, i) => (
                  <Image key={p} src={p} alt={`${loc.name} photo ${i + 2}`} width={160} height={100} className="h-16 w-24 shrink-0 rounded-xl border-2 border-white object-cover" />
                ))}
              </div>
            )}
          </div>

          <header className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-teal-strong">{TYPE_LABEL[loc.type]}</p>
              <h1 className="mt-1 text-3xl font-bold">{loc.name}</h1>
              {loc.address && <p className="mt-1 text-muted-foreground">{loc.address}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {loc.rating !== null && loc.review_count > 0 && (
                  <span className="inline-flex items-center gap-1 text-sm font-medium">
                    <StarIcon className="size-4 fill-filling text-filling" aria-hidden /> {loc.rating.toFixed(1)}
                    <span className="text-muted-foreground">({loc.review_count} reviews)</span>
                  </span>
                )}
                <DistanceFromYou lat={loc.lat} lng={loc.lng} />
              </div>
            </div>
            <div className="flex shrink-0">
              <ShareButton title={loc.name} />
              <FavoriteButton locationId={loc.id} initial={favorite} />
            </div>
          </header>

          <section aria-labelledby="avail-title" className="rounded-2xl border bg-card p-5 shadow-soft">
            <h2 id="avail-title" className="mb-3 font-semibold">
              Availability
            </h2>
            <div className="mb-5 flex flex-wrap gap-2">
              <AvailabilityBadge available={loc.available_now} total={loc.total_spots} mode={loc.availability_mode} />
              {probability !== null && <PredictionPill probability={probability} />}
            </div>
            <ForecastChart locationId={loc.id} timezone={loc.timezone} />
          </section>

          <section aria-labelledby="details-title">
            <h2 id="details-title" className="mb-3 text-lg font-semibold">
              Details
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              <Detail icon={UmbrellaIcon} label={loc.covered ? "Covered parking" : "Uncovered / open-air"} />
              <Detail icon={ZapIcon} label={loc.ev_charging ? "EV charging available" : "No EV charging listed"} muted={!loc.ev_charging} />
              <Detail icon={AccessibilityIcon} label={loc.accessible ? "Wheelchair accessible" : "Accessibility not listed"} muted={!loc.accessible} />
              <Detail icon={ClockIcon} label={summarizeHours(loc.opening_hours)} />
              <Detail icon={UsersIcon} label={`${loc.capacity_estimated ? "About " : ""}${loc.total_spots} spaces${loc.capacity_estimated ? " (estimated)" : ""}`} />
              <Detail icon={DatabaseIcon} label={`Source: ${sourceLabel}`} />
            </ul>
            {loc.description && <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{loc.description}</p>}
            {(loc.price_estimated || loc.source !== "host") && (
              <p className="mt-4 flex gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
                <InfoIcon className="size-4 shrink-0" aria-hidden />
                {loc.price_estimated
                  ? "This price is an estimate for the area. The operator's posted rate may differ."
                  : "Public parking from open data."}{" "}
                ParkSmart reservations here hold one of a limited pool of app-bookable spaces.
              </p>
            )}
          </section>

          <section aria-labelledby="reviews-title">
            <h2 id="reviews-title" className="mb-3 text-lg font-semibold">
              Reviews
            </h2>
            {reviews.length === 0 ? (
              <EmptyState art="calendar" title="No reviews yet" description="Drivers can review after a completed booking here." className="rounded-2xl border py-10" />
            ) : (
              <ul className="space-y-3">
                {reviews.map((r) => (
                  <li key={r.id} className="rounded-2xl border bg-card p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{r.author_name ?? "Driver"}</p>
                      <p className="text-xs text-muted-foreground">{relativeTime(r.created_at)}</p>
                    </div>
                    <div className="mt-1 flex gap-0.5" aria-label={`${r.rating} out of 5 stars`}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <StarIcon key={i} className={cn("size-3.5", i < r.rating ? "fill-filling text-filling" : "text-border")} aria-hidden />
                      ))}
                    </div>
                    {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Booking card (desktop) */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-4 rounded-2xl border bg-card p-6 shadow-lift">
            <p className="text-3xl font-bold">
              {loc.hourly_price === 0 ? "Free" : money(loc.hourly_price)}
              {loc.hourly_price > 0 && <span className="text-base font-medium text-muted-foreground"> / hour</span>}
            </p>
            {loc.price_estimated && <p className="-mt-3 text-xs text-muted-foreground">Estimated area rate</p>}
            <Link href={bookHref} className={cn(buttonVariants({ size: "lg", variant: "teal" }), "w-full")}>
              Reserve a space
            </Link>
            <DirectionsButton lat={loc.lat} lng={loc.lng} label={loc.name} size="lg" className="w-full" />
            <p className="text-center text-xs text-muted-foreground">Free cancellation up to 1 hour before start</p>
          </div>
        </aside>
      </div>

      {/* Sticky mobile reserve bar */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-background/95 p-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="shrink-0">
            <p className="text-lg leading-tight font-bold">{loc.hourly_price === 0 ? "Free" : money(loc.hourly_price)}</p>
            <p className="text-xs text-muted-foreground">{loc.hourly_price > 0 ? "per hour" : "to park"}</p>
          </div>
          <DirectionsButton lat={loc.lat} lng={loc.lng} label={loc.name} size="lg" />
          <Link href={bookHref} className={cn(buttonVariants({ size: "lg", variant: "teal" }), "flex-1")}>
            Reserve
          </Link>
        </div>
      </div>
    </div>
  );
}

function Detail({ icon: Icon, label, muted }: { icon: typeof ZapIcon; label: string; muted?: boolean }) {
  return (
    <li className={cn("flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm", muted && "text-muted-foreground")}>
      <Icon className="size-5 shrink-0 text-teal-strong" aria-hidden />
      {label}
    </li>
  );
}
