import type { Metadata } from "next";
import { DemoBadge } from "@/components/demo/demo-bits";
import { EventList } from "@/components/demo/event-alerts";
import { Planner } from "@/components/demo/planner";
import { SiteFooter } from "@/components/layout/site-footer";

export const metadata: Metadata = {
  title: "Best time to park",
  description: "Plan when to arrive: weekly parking demand, prices and event impact for San Francisco neighbourhoods (demo data).",
};

export default async function PlannerPage(props: PageProps<"/planner">) {
  const sp = await props.searchParams;
  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-4 py-8 pb-28 sm:px-6">
        <p className="text-sm font-semibold tracking-wide text-teal-strong uppercase">Planner</p>
        <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Best time to park</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Pick where and when you&apos;re going. ParkSmart compares nearby arrival times and suggests when you&apos;re most likely to find a space at a good price.
          This prototype uses generated demo data, not live counts.
        </p>
        <div className="mt-6">
          <Planner initialArea={typeof sp.area === "string" ? sp.area : undefined} />
        </div>
        <section aria-labelledby="events-title" className="mt-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 id="events-title" className="text-2xl font-semibold">
              Upcoming events that affect parking
            </h2>
            <DemoBadge />
          </div>
          <EventList />
        </section>
      </div>
      <SiteFooter />
    </>
  );
}
