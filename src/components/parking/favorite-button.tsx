"use client";

import { HeartIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function FavoriteButton({ locationId, initial = false, className }: { locationId: string; initial?: boolean; className?: string }) {
  const { profile } = useSession();
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!profile) {
      toast("Sign in to save favorites", { action: { label: "Sign in", onClick: () => router.push(`/login?next=${encodeURIComponent(location.pathname)}`) } });
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const next = !saved;
    setSaved(next);
    const { error } = next
      ? await supabase.from("favorites").insert({ user_id: profile.id, location_id: locationId })
      : await supabase.from("favorites").delete().eq("user_id", profile.id).eq("location_id", locationId);
    setBusy(false);
    if (error && error.code !== "23505") {
      setSaved(!next);
      toast.error("Couldn't update favorites");
      return;
    }
    toast.success(next ? "Saved to favorites" : "Removed from favorites");
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("rounded-full", className)}
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? "Remove from favorites" : "Save to favorites"}
    >
      <HeartIcon className={cn("size-5 transition-colors", saved && "fill-full text-full")} />
    </Button>
  );
}
