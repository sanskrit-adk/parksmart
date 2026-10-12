export const SF_CENTER = { lat: 37.7793, lng: -122.4193 };

export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Deep links that open native turn-by-turn navigation. */
export function directionsLinks(dest: { lat: number; lng: number }, label?: string) {
  const ll = `${dest.lat},${dest.lng}`;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving`,
    apple: `https://maps.apple.com/?daddr=${ll}&dirflg=d${label ? `&q=${encodeURIComponent(label)}` : ""}`,
    walkingGoogle: `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=walking`,
  };
}

export function isAppleDevice() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && "ontouchend" in document;
}
