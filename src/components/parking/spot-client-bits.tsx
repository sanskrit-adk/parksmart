"use client";

import { FootprintsIcon, Share2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useGeolocation } from "@/hooks/use-geolocation";
import { distance, walkMinutes } from "@/lib/format";
import { haversine } from "@/lib/geo";

export function DistanceFromYou({ lat, lng }: { lat: number; lng: number }) {
  const { position, status, request } = useGeolocation();
  if (!position) {
    return (
      <Button variant="link" size="sm" className="h-auto px-0" onClick={request} loading={status === "locating"}>
        <FootprintsIcon /> Show distance from me
      </Button>
    );
  }
  const d = haversine(position, { lat, lng });
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <FootprintsIcon className="size-4" aria-hidden />
      {distance(d)} away{d < 5000 ? ` · ${walkMinutes(d)} min walk` : ""}
    </span>
  );
}

export function ShareButton({ title }: { title: string }) {
  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error("Couldn't share this page");
    }
  }
  return (
    <Button variant="ghost" size="icon" className="rounded-full" onClick={share} aria-label="Share">
      <Share2Icon className="size-5" />
    </Button>
  );
}
