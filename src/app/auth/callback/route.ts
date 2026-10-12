import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Handles Google OAuth (PKCE code) and email confirmation / magic links (token_hash). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();

  let error: { message: string } | null = null;
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash }));
  } else {
    error = { message: url.searchParams.get("error_description") ?? "Missing sign-in code" };
  }

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
  }
  return NextResponse.redirect(new URL(next, url.origin));
}

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/find";
}
