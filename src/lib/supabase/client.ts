"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

let client: SupabaseClient | null = null;

export function createClient() {
  if (!client) {
    client = createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
  }
  return client;
}
