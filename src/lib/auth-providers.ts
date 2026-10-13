import "server-only";

import { publicEnv } from "@/lib/env";

/**
 * Which OAuth providers are actually enabled on the Supabase project, so the UI
 * never shows a sign-in button that leads to an "provider is not enabled" error.
 */
export async function enabledProviders(): Promise<{ google: boolean }> {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) return { google: false };
  try {
    const res = await fetch(`${publicEnv.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: publicEnv.supabaseAnonKey },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { google: false };
    const settings = (await res.json()) as { external?: { google?: boolean } };
    return { google: Boolean(settings.external?.google) };
  } catch {
    return { google: false };
  }
}
