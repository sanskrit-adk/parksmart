import type { Metadata } from "next";
import { DemoBadge } from "@/components/demo/demo-bits";
import { ImpactDashboard } from "@/components/demo/impact";
import { SiteFooter } from "@/components/layout/site-footer";

export const metadata: Metadata = {
  title: "Traffic & environmental impact",
  description: "Estimated search time, driving and CO₂ avoided when drivers pre-book parking (demo data).",
};

export default function ImpactPage() {
  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-4 py-8 pb-28 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold tracking-wide text-teal-strong uppercase">Impact</p>
          <DemoBadge />
        </div>
        <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Traffic & environmental impact</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Drivers circling for parking add traffic and emissions. When a driver reserves a space before leaving, that search disappears. Here is an estimate of
          what ParkSmart saves, from generated demo data.
        </p>
        <div className="mt-6">
          <ImpactDashboard />
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
