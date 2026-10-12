// Copies MapLibre's web worker into /public so it can be served as a static
// file (bundlers don't emit it). Runs on every `npm install` via postinstall.
import { copyFileSync, existsSync } from "node:fs";

const src = "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs";
if (existsSync(src)) {
  copyFileSync(src, "public/maplibre-gl-worker.mjs");
  console.log("Copied MapLibre worker to public/");
}
