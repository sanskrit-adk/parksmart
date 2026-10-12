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

export function serverEnv() {
  return {
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    openaiApiKey: process.env.OPENAI_API_KEY ?? "",
    openaiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    openaiVisionModel: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    cvServiceUrl: process.env.CV_SERVICE_URL ?? "",
    cvServiceToken: process.env.CV_SERVICE_TOKEN ?? "",
    cronSecret: process.env.CRON_SECRET ?? "",
  };
}

export const hasAI = () => Boolean(process.env.OPENAI_API_KEY);
export const hasStripe = () => Boolean(process.env.STRIPE_SECRET_KEY);
