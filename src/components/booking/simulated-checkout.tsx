"use client";

import { CreditCardIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import { money } from "@/lib/format";

export function SimulatedCheckout({
  target,
  amount,
  cancelHref,
}: {
  target: { booking_id: string } | { extension_id: string };
  amount: number;
  cancelHref: string;
}) {
  const router = useRouter();
  const [paying, setPaying] = useState(false);

  async function pay() {
    setPaying(true);
    try {
      const res = await api<{ booking_id: string }>("/api/checkout/simulated", { json: target });
      toast.success("Payment simulated", { description: "No real money was charged." });
      router.replace(`/bookings/${res.booking_id}${"extension_id" in target ? "?extended=1&paid=1" : "?paid=1"}`);
      router.refresh();
    } catch (e) {
      toast.error("Payment failed", { description: (e as Error).message });
      setPaying(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button variant="outline" size="lg" disabled={paying} onClick={() => router.push(cancelHref)}>
        Cancel
      </Button>
      <Button variant="teal" size="lg" className="flex-1" onClick={pay} loading={paying}>
        <CreditCardIcon /> Pay {money(amount)} (simulated)
      </Button>
    </div>
  );
}
