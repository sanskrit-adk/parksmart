import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/lib/types";

export async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null };
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  return { supabase, user, profile };
}

/** For pages: redirect to login (or home) unless the user has one of the roles. */
export async function requirePageRole(roles: UserRole[] | null, next: string) {
  const session = await getSession();
  if (!session.user || !session.profile) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (roles && !roles.includes(session.profile.role)) redirect("/?denied=1");
  return session as typeof session & { user: NonNullable<typeof session.user>; profile: Profile };
}
