/**
 * Central place for environment access. Public values are inlined at build
 * time by Next.js; server values must only be read from server code.
 */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

/** Treats unset values and .env.example placeholders (sk_test_..., YOUR-…) as empty. */
export function secret(v: string | undefined) {
  return !v || /\.\.\.$|YOUR-/.test(v) ? "" : v;
}

export function serverEnv() {
  return {
    supabaseServiceRoleKey: secret(process.env.SUPABASE_SERVICE_ROLE_KEY),
    openaiApiKey: secret(process.env.OPENAI_API_KEY),
    openaiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    openaiVisionModel: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
    stripeSecretKey: secret(process.env.STRIPE_SECRET_KEY),
    stripeWebhookSecret: secret(process.env.STRIPE_WEBHOOK_SECRET),
    cvServiceUrl: process.env.CV_SERVICE_URL ?? "",
    cvServiceToken: process.env.CV_SERVICE_TOKEN ?? "",
    cronSecret: process.env.CRON_SECRET ?? "",
  };
}

export const hasAI = () => Boolean(secret(process.env.OPENAI_API_KEY));

/**
 * Local testing without Stripe: checkout is simulated (no money moves) when no
 * Stripe key is set AND it's a dev server or ALLOW_SIMULATED_PAYMENTS=true.
 * Never enable this on a public deployment.
 */
export const simulatedPayments = () =>
  !secret(process.env.STRIPE_SECRET_KEY) && (process.env.NODE_ENV !== "production" || process.env.ALLOW_SIMULATED_PAYMENTS === "true");
export const hasStripe = () => Boolean(secret(process.env.STRIPE_SECRET_KEY));
