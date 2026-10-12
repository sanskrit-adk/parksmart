/**
 * Applies supabase/migrations/*.sql to your Supabase database, in order, once each.
 * Uses SUPABASE_DB_URL (Supabase → Project Settings → Database → Connection string → URI).
 *
 *   npm run db:migrate
 */
import { config } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

config({ path: ".env.local" });
config();

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url || url.includes("YOUR-PASSWORD")) {
    throw new Error("Set SUPABASE_DB_URL in .env.local (Supabase → Project Settings → Database → Connection string → URI)");
  }
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(`create table if not exists public._parksmart_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const { rows } = await client.query<{ name: string }>("select name from public._parksmart_migrations");
  const done = new Set(rows.map((r) => r.name));

  const dir = join(process.cwd(), "supabase", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) {
      console.log(`• ${file} already applied`);
      continue;
    }
    process.stdout.write(`• applying ${file} … `);
    try {
      await client.query("begin");
      await client.query(readFileSync(join(dir, file), "utf8"));
      await client.query("insert into public._parksmart_migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log("ok");
    } catch (err) {
      await client.query("rollback");
      console.log("FAILED");
      if (file.includes("cron")) {
        console.warn(`  pg_cron isn't available on this project (${(err as Error).message}).\n  Enable it under Database → Extensions and re-run, or use Vercel Cron (see README).`);
        continue;
      }
      throw err;
    }
  }
  await client.end();
  console.log("Database is up to date.");
}

main().catch((err) => {
  console.error("\nMigration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
