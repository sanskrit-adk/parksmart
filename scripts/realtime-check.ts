/**
 * Verifies live availability end to end: subscribes to parking_locations like
 * the map does, books the demo driveway as the test driver, and waits for the
 * Realtime update.   npx tsx scripts/realtime-check.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function main() {
  const watcher = createClient(url, anon);
  const driver = createClient(url, anon);
  const { error: authErr } = await driver.auth.signInWithPassword({ email: "driver@parksmart.test", password: process.env.SEED_TEST_PASSWORD || "ParkSmart-Demo-2026!" });
  if (authErr) throw authErr;

  const { data: loc } = await driver.from("parking_locations").select("id, name, available_now").eq("external_id", "demo:host/mission-driveway").single();
  if (!loc) throw new Error("Demo listing not found — run the seed first");
  console.log(`• ${loc.name}: ${loc.available_now} free before booking`);

  const got = new Promise<{ available_now: number }>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("No Realtime update within 15s")), 15000);
    watcher
      .channel("rt-check")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "parking_locations", filter: `id=eq.${loc.id}` }, (p) => {
        clearTimeout(t);
        resolve(p.new as { available_now: number });
      })
      .subscribe((status) => status === "SUBSCRIBED" && console.log("• subscribed to live availability"));
  });
  await new Promise((r) => setTimeout(r, 1500));

  const start = new Date(Date.now() + 2 * 60_000);
  const { data: booking, error } = await driver
    .rpc("create_booking_hold", { p_location_id: loc.id, p_start: start.toISOString(), p_end: new Date(start.getTime() + 3_600_000).toISOString() })
    .single<{ id: string }>();
  if (error) throw error;
  console.log("• booked (hold created)");

  const update = await got;
  console.log(`✔ Realtime update received: ${update.available_now} free now`);

  // Clean up: release the hold.
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  await admin.from("bookings").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", booking.id);
  await watcher.removeAllChannels();
}

main()
  .then(() => (process.exitCode = 0))
  .catch((e) => {
    console.error("✘", e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 500));
