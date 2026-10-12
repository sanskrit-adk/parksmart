import Link from "next/link";
import { Logo } from "@/components/logo";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t bg-card/50 pb-24 md:pb-0">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">
            AI-powered parking for the San Francisco Bay Area. Find, predict, book and pay — in seconds.
          </p>
        </div>
        <FooterCol
          title="Drivers"
          links={[
            ["/find", "Find parking"],
            ["/bookings", "My bookings"],
            ["/check-in", "Plate check-in"],
            ["/profile", "Saved vehicles"],
          ]}
        />
        <FooterCol
          title="Hosts"
          links={[
            ["/host/new", "List your space"],
            ["/host", "Earnings dashboard"],
            ["/#how-ai-helps", "How AI helps"],
          ]}
        />
        <FooterCol
          title="ParkSmart"
          links={[
            ["/about", "About & data sources"],
            ["/about#privacy", "Privacy"],
            ["/about#terms", "Terms & refunds"],
          ]}
        />
      </div>
      <div className="border-t">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-muted-foreground sm:px-6">
          © {year} ParkSmart. Map data © OpenStreetMap contributors (ODbL) · Meter data: SFMTA via DataSF · Maps © Mapbox.
        </p>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="mb-3 text-sm font-semibold">{title}</p>
      <ul className="space-y-2 text-sm text-muted-foreground">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="hover:text-foreground">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
