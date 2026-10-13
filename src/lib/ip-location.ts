import "server-only";

/**
 * Approximate visitor location from the request (city-level). On Vercel these
 * headers are set for every request; locally they're absent and this returns null.
 */
export function ipLocation(headers: Headers): { lat: number; lng: number; city: string | null } | null {
  const lat = Number(headers.get("x-vercel-ip-latitude"));
  const lng = Number(headers.get("x-vercel-ip-longitude"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0) || !headers.get("x-vercel-ip-latitude")) return null;
  const rawCity = headers.get("x-vercel-ip-city");
  let city: string | null = null;
  try {
    city = rawCity ? decodeURIComponent(rawCity) : null;
  } catch {
    city = rawCity;
  }
  return { lat, lng, city };
}
