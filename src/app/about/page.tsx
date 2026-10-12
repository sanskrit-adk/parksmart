import type { Metadata } from "next";
import { SiteFooter } from "@/components/layout/site-footer";
import { REFUND_POLICY_TEXT } from "@/lib/pricing";

export const metadata: Metadata = { title: "About, data & policies" };

export default function AboutPage() {
  return (
    <>
      <article className="mx-auto w-full max-w-3xl space-y-12 px-4 py-12 sm:px-6">
        <header>
          <h1 className="text-4xl font-bold">About ParkSmart</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            ParkSmart helps Bay Area drivers find a space that will actually be free when they arrive, and helps hosts and operators fill theirs.
          </p>
        </header>

        <section id="data" className="scroll-mt-24 space-y-3">
          <h2 className="text-2xl font-semibold">Where the data comes from</h2>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            <li>
              <strong className="text-foreground">Garages and lots</strong> are imported from OpenStreetMap (<code>amenity=parking</code>) via the Overpass API. © OpenStreetMap
              contributors, available under the Open Database License.
            </li>
            <li>
              <strong className="text-foreground">Street meters</strong> come from the SFMTA Parking Meters dataset on DataSF, grouped by block face.
            </li>
            <li>
              <strong className="text-foreground">Host listings</strong> are added by ParkSmart hosts.
            </li>
          </ul>
          <p className="text-muted-foreground">
            Where a price or capacity isn&apos;t published in the source data, we estimate it and label it <em>estimated</em> in the app.
          </p>
        </section>

        <section id="availability" className="scroll-mt-24 space-y-3">
          <h2 className="text-2xl font-semibold">“Live” vs “Estimated”</h2>
          <p className="text-muted-foreground">
            <strong className="text-foreground">Live</strong> means we actually know the count: the space is fully managed through ParkSmart bookings, or a camera image was analysed in the
            last 30 minutes. <strong className="text-foreground">Estimated</strong> means there&apos;s no sensor, so we combine typical demand for that type of parking at that
            time of day with ParkSmart bookings and nearby events. Predictions improve as real history accumulates.
          </p>
        </section>

        <section id="terms" className="scroll-mt-24 space-y-3">
          <h2 className="text-2xl font-semibold">Bookings, payments & refunds</h2>
          <p className="text-muted-foreground">Payments are processed by Stripe. ParkSmart never sees or stores your card number.</p>
          <p className="text-muted-foreground">{REFUND_POLICY_TEXT}</p>
          <p className="text-muted-foreground">
            Reservations at public garages, lots and meters hold one of a limited pool of ParkSmart-bookable spaces. Always follow posted signs and local regulations.
          </p>
        </section>

        <section id="privacy" className="scroll-mt-24 space-y-3">
          <h2 className="text-2xl font-semibold">Privacy</h2>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            <li>Your location is used in your browser to find nearby parking. It isn&apos;t stored on our servers.</li>
            <li>Licence plate photos are read once by the AI and never stored. Only the plate text you save is kept.</li>
            <li>Lot images uploaded by hosts and operators are stored to show detection results.</li>
            <li>You can delete saved vehicles and favourites at any time from your profile.</li>
          </ul>
        </section>
      </article>
      <SiteFooter />
    </>
  );
}
