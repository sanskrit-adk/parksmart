"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SeriesChart } from "@/components/charts/series-chart";
import { PriceSuggestion } from "@/components/host/price-suggestion";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/fetcher";
import { money, shortDate } from "@/lib/format";

export function ListingActiveToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(active);
  const [busy, setBusy] = useState(false);
  async function toggle(v: boolean) {
    setBusy(true);
    setOn(v);
    try {
      await api(`/api/host/locations/${id}`, { method: "PATCH", json: { is_active: v } });
      toast.success(v ? "Listing is live" : "Listing paused", { description: v ? "Drivers can book it again." : "It's hidden from search." });
      router.refresh();
    } catch (e) {
      setOn(!v);
      toast.error("Couldn't update listing", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch checked={on} onCheckedChange={toggle} disabled={busy} aria-label={on ? "Pause listing" : "Activate listing"} />
      {on ? "Live" : "Paused"}
    </label>
  );
}

export function EarningsChart({ data }: { data: { day: string; revenue: number }[] }) {
  return (
    <SeriesChart
      kind="bar"
      title="Earnings, last 30 days"
      valueLabel="Earnings"
      data={data.map((d) => ({ label: shortDate(`${d.day.slice(0, 10)}T12:00:00Z`), value: Number(d.revenue) }))}
      format={(v) => money(v, { compact: true })}
      height={220}
    />
  );
}

/** Price suggestion that applies immediately to an existing listing. */
export function ApplyPriceSuggestion({ locationId, currentPrice }: { locationId: string; currentPrice: number }) {
  const router = useRouter();
  const [price, setPrice] = useState(currentPrice);
  return (
    <PriceSuggestion
      request={{ location_id: locationId }}
      currentPrice={price}
      onApply={async (p) => {
        try {
          await api(`/api/host/locations/${locationId}`, { method: "PATCH", json: { hourly_price: p } });
          setPrice(p);
          toast.success(`Price updated to ${money(p)}/hr`);
          router.refresh();
        } catch (e) {
          toast.error("Couldn't apply the price", { description: (e as Error).message });
        }
      }}
    />
  );
}
