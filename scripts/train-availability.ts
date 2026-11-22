/**
 * Trains a small availability model (linear regression on occupancy) and reports
 * its accuracy on a held-out test set against a naive baseline.
 *
 *   npx tsx scripts/train-availability.ts           # uses occupancy_history from SUPABASE_DB_URL
 *   npx tsx scripts/train-availability.ts --demo    # synthetic, clearly labelled demo data
 *
 * Features: hour of day (sin/cos), weekday/weekend, day-of-week one-hot,
 * location type, and the location's mean occupancy (demand level).
 * Output: MAE and "free at arrival" accuracy (busy = occupancy >= 70%) vs baseline.
 *   npx tsx scripts/train-availability.ts --per-spot [--demo]
 *     Evaluates per-space prediction (spot_free_probability's blend: location rate
 *     + the space's shrunk all-hours offset, then its weekday/hour history, k=10) vs the
 *     location-only baseline, on the last 7 days held out.
 * Writes nothing to the database.
 */
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });
config();

interface Row { location_id: string; type: string; ts: Date; rate: number }

const BUSY = 0.7;
const TYPES = ["garage", "lot", "street", "private"];

function demoData(): Row[] {
  const rows: Row[] = [];
  let seed = 42;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
  for (let l = 0; l < 40; l++) {
    const type = TYPES[l % 4];
    const base = 0.3 + rand() * 0.4;
    for (let d = 0; d < 28; d++) {
      for (let h = 0; h < 24; h++) {
        const ts = new Date(Date.UTC(2026, 9, 1 + d, h));
        const dow = ts.getUTCDay();
        const weekend = dow === 0 || dow === 6;
        const peak = Math.exp(-((h - (weekend ? 14 : 12)) ** 2) / 18);
        const rate = Math.min(1, Math.max(0, base * 0.5 + peak * (weekend ? 0.35 : 0.5) + (type === "street" ? 0.1 : 0) + (rand() - 0.5) * 0.15));
        rows.push({ location_id: `demo-${l}`, type, ts, rate });
      }
    }
  }
  return rows;
}

async function dbData(): Promise<Row[]> {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("Set SUPABASE_DB_URL or pass --demo");
  const client = new pg.Client({ connectionString: url, ssl: /localhost|127.0.0.1/.test(url) ? false : { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query(
    `select h.location_id, l.type::text as type, h.ts, least(1, h.occupied_count::float / h.total_spots) as rate
       from occupancy_history h join parking_locations l on l.id = h.location_id
      order by h.ts limit 200000`,
  );
  await client.end();
  return rows.map((r) => ({ ...r, ts: new Date(r.ts) }));
}

function features(r: Row, locMean: number): number[] {
  const h = r.ts.getUTCHours();
  const dow = r.ts.getUTCDay();
  const dowOneHot = Array.from({ length: 7 }, (_, i) => (i === dow ? 1 : 0));
  const typeOneHot = TYPES.map((t) => (t === r.type ? 1 : 0));
  return [1, Math.sin((2 * Math.PI * h) / 24), Math.cos((2 * Math.PI * h) / 24), Math.sin((4 * Math.PI * h) / 24), Math.cos((4 * Math.PI * h) / 24), dow === 0 || dow === 6 ? 1 : 0, ...dowOneHot, ...typeOneHot, locMean];
}

/** Ridge regression via normal equations (small feature count). */
function fit(X: number[][], y: number[], lambda = 1e-3) {
  const n = X[0].length;
  const A = Array.from({ length: n }, () => new Array(n + 1).fill(0));
  for (let i = 0; i < X.length; i++) {
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) A[a][b] += X[i][a] * X[i][b];
      A[a][n] += X[i][a] * y[i];
    }
  }
  for (let a = 0; a < n; a++) A[a][a] += lambda;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < n; r++) {
      if (r === c || A[c][c] === 0) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  return A.map((row, i) => (row[i] === 0 ? 0 : row[n] / row[i]));
}

const predict = (w: number[], x: number[]) => Math.min(1, Math.max(0, x.reduce((s, v, i) => s + v * w[i], 0)));

interface SpotRow { spot_id: string; location_id: string; ts: Date; busy: boolean }

function demoSpotData(): SpotRow[] {
  let seed = 11;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
  const rows: SpotRow[] = [];
  for (let l = 0; l < 6; l++) {
    for (let s = 0; s < 20; s++) {
      const bias = 0.25 * (1 - s / 19) - 0.1 + (rand() - 0.5) * 0.2;
      const regular = rand() < 0.15;
      for (let d = 0; d < 35; d++) for (let h = 0; h < 24; h++) {
        const ts = new Date(Date.UTC(2026, 9, 1 + d, h));
        const weekend = [0, 6].includes(ts.getUTCDay());
        const peak = Math.exp(-((h - (weekend ? 14 : 12)) ** 2) / 18) * 0.7;
        const p = regular && !weekend && h >= 8 && h < 18 ? 0.95 : Math.min(0.97, Math.max(0.03, 0.1 + peak + bias));
        rows.push({ spot_id: `demo-${l}-${s}`, location_id: `demo-${l}`, ts, busy: rand() < p });
      }
    }
  }
  return rows;
}

async function dbSpotData(): Promise<SpotRow[]> {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("Set SUPABASE_DB_URL or pass --demo");
  const client = new pg.Client({ connectionString: url, ssl: /localhost|127.0.0.1/.test(url) ? false : { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query(`select spot_id, location_id, ts, busy from spot_occupancy_history order by ts limit 500000`);
  await client.end();
  return rows.map((r) => ({ ...r, ts: new Date(r.ts) }));
}

async function perSpot(demo: boolean) {
  let rows = demo ? [] : await dbSpotData();
  let label = "spot_occupancy_history";
  if (rows.length < 500) {
    if (!demo) console.log(`Only ${rows.length} spot history rows; falling back to demo data.`);
    rows = demoSpotData();
    label = "DEMO (synthetic) data";
  }
  const cut = Math.max(...rows.map((r) => r.ts.getTime())) - 7 * 86_400_000;
  const train = rows.filter((r) => r.ts.getTime() <= cut);
  const test = rows.filter((r) => r.ts.getTime() > cut);
  const key = (id: string, ts: Date) => `${id}|${ts.getUTCDay()}|${ts.getUTCHours()}`;
  const agg = new Map<string, { s: number; n: number }>();
  const add = (k: string, v: number) => { const m = agg.get(k) ?? { s: 0, n: 0 }; m.s += v; m.n++; agg.set(k, m); };
  for (const r of train) { add(key(r.spot_id, r.ts), +r.busy); add(key(r.location_id, r.ts), +r.busy); }
  const rate = (k: string, fallback: number) => { const m = agg.get(k); return m ? m.s / m.n : fallback; };
  // Space offset over ALL hours (more data than one weekday/hour bucket), shrunk.
  const tot = new Map<string, { s: number; n: number }>();
  const addT = (k: string, v: number) => { const m = tot.get(k) ?? { s: 0, n: 0 }; m.s += v; m.n++; tot.set(k, m); };
  for (const r of train) { addT(r.spot_id, +r.busy - rate(key(r.location_id, r.ts), 0.5)); }
  const offset = (id: string) => { const m = tot.get(id); return m ? m.s / (m.n + 10) : 0; };
  const K = 10;
  let brierLoc = 0, brierSpot = 0, accLoc = 0, accSpot = 0;
  for (const r of test) {
    const loc = rate(key(r.location_id, r.ts), 0.5);
    const m = agg.get(key(r.spot_id, r.ts));
    const base = Math.min(0.98, Math.max(0.02, loc + offset(r.spot_id)));
    const spot = m ? (m.s + base * K) / (m.n + K) : base;
    const y = +r.busy;
    brierLoc += (loc - y) ** 2; brierSpot += (spot - y) ** 2;
    accLoc += Number((loc >= 0.5) === r.busy); accSpot += Number((spot >= 0.5) === r.busy);
  }
  const n = test.length;
  console.log(`
Per-space prediction — ${label}`);
  console.log(`  train rows: ${train.length}, test rows: ${n} (last 7 days held out)`);
  console.log(`  Brier score (lower is better): per-space ${(brierSpot / n).toFixed(4)} vs location-only ${(brierLoc / n).toFixed(4)}`);
  console.log(`  "Is this space free?" accuracy: per-space ${(accSpot / n * 100).toFixed(1)}% vs location-only ${(accLoc / n * 100).toFixed(1)}%
`);
}

async function main() {
  const demo = process.argv.includes("--demo");
  if (process.argv.includes("--per-spot")) return perSpot(demo);
  let rows = demo ? demoData() : await dbData();
  let label = demo ? "DEMO (synthetic) data" : "occupancy_history";
  if (!demo && rows.length < 200) {
    console.log(`Only ${rows.length} history rows in the database; falling back to demo data.`);
    rows = demoData();
    label = "DEMO (synthetic) data";
  }
  rows.sort((a, b) => a.ts.getTime() - b.ts.getTime());
  const split = Math.floor(rows.length * 0.8);
  const train = rows.slice(0, split);
  const test = rows.slice(split);

  const sums = new Map<string, { s: number; n: number }>();
  for (const r of train) {
    const m = sums.get(r.location_id) ?? { s: 0, n: 0 };
    m.s += r.rate; m.n++;
    sums.set(r.location_id, m);
  }
  const globalMean = train.reduce((s, r) => s + r.rate, 0) / train.length;
  const locMean = (id: string) => { const m = sums.get(id); return m ? m.s / m.n : globalMean; };

  const w = fit(train.map((r) => features(r, locMean(r.location_id))), train.map((r) => r.rate));

  let maeModel = 0, maeBase = 0, accModel = 0, accBase = 0;
  for (const r of test) {
    const p = predict(w, features(r, locMean(r.location_id)));
    const b = globalMean;
    maeModel += Math.abs(p - r.rate);
    maeBase += Math.abs(b - r.rate);
    const actualFree = r.rate < BUSY;
    accModel += Number((p < BUSY) === actualFree);
    accBase += Number((b < BUSY) === actualFree);
  }
  const n = test.length;
  console.log(`\nParkSmart availability model — trained on ${label}`);
  console.log(`  train rows: ${train.length}, test rows: ${n} (time-ordered 80/20 split)`);
  console.log(`  Mean absolute error (occupancy): model ${(maeModel / n * 100).toFixed(1)} pts vs baseline ${(maeBase / n * 100).toFixed(1)} pts`);
  console.log(`  "Busy (>=70% full)" accuracy: model ${(accModel / n * 100).toFixed(1)}% vs baseline ${(accBase / n * 100).toFixed(1)}%`);
  console.log(`  weights: ${w.map((v) => v.toFixed(3)).join(", ")}\n`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
