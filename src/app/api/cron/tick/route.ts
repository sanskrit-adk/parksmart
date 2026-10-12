import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Booking lifecycle + availability refresh. pg_cron runs public.tick() every
 * minute by default; this endpoint is an alternative for Vercel Cron.
 */
export async function GET(req: Request) {
  const secret = serverEnv().cronSecret;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { data, error } = await createAdminClient().rpc("tick");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, result: data });
}
