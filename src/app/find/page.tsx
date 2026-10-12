import type { Metadata } from "next";
import { FindParking } from "@/components/find/find-parking";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Find parking",
  description: "AI-ranked parking near you or your destination, with live and predicted availability.",
};

export default async function FindPage(props: PageProps<"/find">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" && sp.q.trim() ? sp.q.trim().slice(0, 500) : null;
  const { supabase, user } = await getSession();
  let favoriteIds: string[] = [];
  if (user) {
    const { data } = await supabase.from("favorites").select("location_id").eq("user_id", user.id);
    favoriteIds = (data ?? []).map((f) => f.location_id);
  }
  return <FindParking initialQuery={q} favoriteIds={favoriteIds} />;
}
