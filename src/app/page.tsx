import { ArrowRightIcon, CalendarCheckIcon, MapPinnedIcon, SparklesIcon, StarIcon } from "lucide-react";
import Link from "next/link";
import { Hero } from "@/components/home/hero";
import { HowAiHelps } from "@/components/home/how-ai-helps";
import { LiveStats, type PublicStats } from "@/components/home/live-stats";
import { SiteFooter } from "@/components/layout/site-footer";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

interface ReviewRow {
  id: string;
  rating: number;
  comment: string;
  author_name: string | null;
  location: { id: string; name: string } | null;
}

export default async function HomePage() {
  const supabase = await createClient();
  const [{ data: stats }, { data: reviews }] = await Promise.all([
    supabase.rpc("public_stats"),
    supabase
      .from("reviews")
      .select("id, rating, comment, author_name, location:parking_locations(id, name)")
      .gte("rating", 4)
      .not("comment", "is", null)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  return (
    <>
      <Hero />
      <LiveStats stats={(stats as PublicStats | null) ?? null} />
      <HowAiHelps />

      <section aria-labelledby="steps-title" className="border-y bg-card/60">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <h2 id="steps-title" className="text-center text-3xl font-bold sm:text-4xl">
            From “where do I park?” to parked in three taps
          </h2>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { icon: SparklesIcon, title: "Describe it", body: "Type or say where you're going, for how long and your budget. Or just tap “near me”." },
              { icon: MapPinnedIcon, title: "Pick the AI favourite", body: "See ranked spots on the map with prices, walk time and the odds of a free space when you get there." },
              { icon: CalendarCheckIcon, title: "Reserve & go", body: "Pay securely, add it to your calendar, follow turn-by-turn directions and check in with your plate." },
            ].map((s, i) => (
              <li key={s.title} className="relative rounded-2xl bg-background p-6">
                <span className="text-5xl font-extrabold text-teal-strong/25">0{i + 1}</span>
                <s.icon className="mt-2 size-6 text-teal-strong" aria-hidden />
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="reviews-title" className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6">
        <h2 id="reviews-title" className="text-center text-3xl font-bold sm:text-4xl">
          What drivers say
        </h2>
        {reviews && reviews.length > 0 ? (
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {(reviews as unknown as ReviewRow[]).map((r) => (
              <figure key={r.id} className="flex flex-col rounded-2xl border bg-card p-6 shadow-soft">
                <div className="flex gap-0.5" aria-label={`${r.rating} out of 5 stars`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <StarIcon key={i} className={cn("size-4", i < r.rating ? "fill-filling text-filling" : "text-border")} aria-hidden />
                  ))}
                </div>
                <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed">“{r.comment}”</blockquote>
                <figcaption className="mt-4 text-sm text-muted-foreground">
                  {r.author_name ?? "Verified driver"} · verified booking
                  {r.location && (
                    <>
                      {" at "}
                      <Link href={`/spots/${r.location.id}`} className="font-medium text-foreground hover:underline">
                        {r.location.name}
                      </Link>
                    </>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="mx-auto mt-6 max-w-md text-center text-muted-foreground">
            Reviews appear here from drivers with completed bookings. Book a space and be one of the first.
          </p>
        )}
      </section>

      <section className="px-4 pb-20 sm:px-6">
        <div className="relative mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 overflow-hidden rounded-3xl bg-navy p-8 text-white sm:p-12 md:flex-row md:items-center">
          <div className="absolute -right-20 -bottom-24 size-72 rounded-full bg-teal/30 blur-3xl" aria-hidden />
          <div className="relative">
            <h2 className="text-2xl font-bold sm:text-3xl">Have an empty driveway or lot?</h2>
            <p className="mt-2 max-w-lg text-white/75">
              List it in minutes. AI suggests the right hourly price for your neighbourhood and your earnings show up on your dashboard.
            </p>
          </div>
          <Link href="/host/new" className={cn(buttonVariants({ variant: "teal", size: "lg" }), "relative")}>
            List your space <ArrowRightIcon />
          </Link>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
