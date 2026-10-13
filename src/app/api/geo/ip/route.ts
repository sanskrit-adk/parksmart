import { ipLocation } from "@/lib/ip-location";

/** Approximate (city-level) location, used when the browser can't share GPS. */
export async function GET(req: Request) {
  return Response.json({ location: ipLocation(req.headers) }, { headers: { "Cache-Control": "private, no-store" } });
}
