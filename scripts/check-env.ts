/**
 * Verifies every configured key against the real service, so problems show up
 * here instead of as broken pages.   npm run check:env
 */
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });
config();

const e = process.env;
type Result = { name: string; ok: boolean | null; detail: string };
const results: Result[] = [];
const placeholder = (v?: string) => !v || /YOUR-|\.\.\.$|^sk_test_\.\.\.|^whsec_\.\.\./.test(v);

async function check(name: string, required: boolean, keys: (string | undefined)[], fn: () => Promise<string>) {
  if (keys.some(placeholder)) {
    results.push({ name, ok: required ? false : null, detail: required ? "not set" : "not set (optional)" });
    return;
  }
  try {
    results.push({ name, ok: true, detail: await fn() });
  } catch (err) {
    results.push({ name, ok: false, detail: (err as Error).message });
  }
}

async function main() {
  await check("Supabase API", true, [e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY], async () => {
    const r = await fetch(`${e.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: e.NEXT_PUBLIC_SUPABASE_ANON_KEY! } });
    if (!r.ok) throw new Error(`auth settings returned ${r.status} — check URL and anon key`);
    const s = (await r.json()) as { external?: { google?: boolean } };
    return `reachable · Google sign-in ${s.external?.google ? "enabled" : "not enabled (optional)"}`;
  });
  await check("Supabase service role", true, [e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY], async () => {
    const r = await fetch(`${e.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?per_page=1`, {
      headers: { apikey: e.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!r.ok) throw new Error(`admin API returned ${r.status} — is this the service_role key (not anon)?`);
    return "valid";
  });
  await check("Supabase database", true, [e.SUPABASE_DB_URL], async () => {
    const c = new pg.Client({ connectionString: e.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
    await c.connect();
    const { rows } = await c.query(`select to_regclass('public.parking_locations') is not null as migrated,
      (select count(*) from pg_class where relname = 'parking_locations') as t`);
    let count = 0;
    if (rows[0].migrated) count = Number((await c.query("select count(*) from public.parking_locations")).rows[0].count);
    await c.end();
    return rows[0].migrated ? `connected · migrated · ${count} parking locations` : "connected · NOT migrated yet (run npm run db:migrate)";
  });
  await check("Mapbox", true, [e.NEXT_PUBLIC_MAPBOX_TOKEN], async () => {
    const r = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?q=Ferry%20Building%20San%20Francisco&limit=1&access_token=${e.NEXT_PUBLIC_MAPBOX_TOKEN}`);
    if (!r.ok) throw new Error(`geocoding returned ${r.status} — check the pk. token`);
    return "valid (geocoding works)";
  });
  await check("OpenAI", false, [e.OPENAI_API_KEY], async () => {
    const r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${e.OPENAI_API_KEY}` } });
    if (!r.ok) throw new Error(`models returned ${r.status} — check the key and billing`);
    const ids = ((await r.json()) as { data: { id: string }[] }).data.map((m) => m.id);
    const model = e.OPENAI_MODEL || "gpt-4.1-mini";
    if (!ids.includes(model)) throw new Error(`key works, but model "${model}" isn't available to it — set OPENAI_MODEL`);
    return `valid · ${model} available`;
  });
  await check("Stripe", true, [e.STRIPE_SECRET_KEY], async () => {
    if (!e.STRIPE_SECRET_KEY!.startsWith("sk_test_")) throw new Error("use a TEST key (sk_test_…) for this project");
    const r = await fetch("https://api.stripe.com/v1/balance", { headers: { Authorization: `Bearer ${e.STRIPE_SECRET_KEY}` } });
    if (!r.ok) throw new Error(`balance returned ${r.status}`);
    return "valid (test mode)";
  });
  await check("Stripe webhook secret", false, [e.STRIPE_WEBHOOK_SECRET], async () => {
    if (!e.STRIPE_WEBHOOK_SECRET!.startsWith("whsec_")) throw new Error("should start with whsec_");
    return "set";
  });

  for (const r of results) console.log(`${r.ok === true ? "✔" : r.ok === false ? "✘" : "–"} ${r.name.padEnd(24)} ${r.detail}`);
  const failed = results.filter((r) => r.ok === false);
  console.log(failed.length ? `\n${failed.length} problem(s) to fix.` : "\nAll required services are configured.");
  process.exit(failed.length ? 1 : 0);
}

main();
