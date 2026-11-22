import type { Metadata } from "next";
import { DemandDashboard } from "@/components/insights/demand-dashboard";
import { SiteFooter } from "@/components/layout/site-footer";

export const metadata: Metadata = {
  title: "Parking predictions & demand",
  description: "Machine-learning forecasts of parking demand, peak hours and expected free spaces across San Francisco.",
};

export default function InsightsPage() {
  return (
    <>
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 pb-28 sm:px-6">
        <header className="max-w-3xl">
          <p className="text-sm font-semibold tracking-wide text-teal-strong uppercase">Traditional ML · Demand forecasting</p>
          <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Parking predictions &amp; demand</h1>
          <p className="mt-2 text-muted-foreground">
            See when and where parking gets busy before you leave. Drivers can pick a better arrival time; parking owners can plan prices and staffing around the peaks.
          </p>
        </header>
        <DemandDashboard />
      </div>
      <SiteFooter />
    </>
  );
}
