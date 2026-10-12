import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv, serverEnv } from "@/lib/env";

/** Request-scoped client that acts as the signed-in user (RLS applies). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: the proxy refreshes sessions instead.
        }
      },
    },
  });
}

/**
 * Service-role client. Bypasses RLS — only use after the route has checked
 * who the caller is and what they may do.
 */
export function createAdminClient() {
  const key = serverEnv().supabaseServiceRoleKey;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createSupabaseClient(publicEnv.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
