const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);

export function bookingIcs(b: {
  id: string;
  start: string;
  end: string;
  title: string;
  location: string;
  description: string;
  url: string;
  lat: number;
  lng: number;
}) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ParkSmart//Bookings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.id}@parksmart`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(new Date(b.start))}`,
    `DTEND:${fmt(new Date(b.end))}`,
    `SUMMARY:${esc(b.title)}`,
    `LOCATION:${esc(b.location)}`,
    `GEO:${b.lat};${b.lng}`,
    `DESCRIPTION:${esc(b.description)}`,
    `URL:${b.url}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Parking starts in 30 minutes",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function googleCalendarUrl(b: { start: string; end: string; title: string; location: string; details: string }) {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: b.title,
    dates: `${fmt(new Date(b.start))}/${fmt(new Date(b.end))}`,
    location: b.location,
    details: b.details,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}
