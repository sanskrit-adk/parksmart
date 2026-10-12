import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ChatWidget } from "@/components/ai/chat-widget";
import { BottomNav } from "@/components/layout/bottom-nav";
import { SiteHeader } from "@/components/layout/site-header";
import { PwaRegister } from "@/components/pwa-register";
import { Providers } from "@/components/providers";
import { getSession } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: {
    default: "ParkSmart — AI parking for the Bay Area",
    template: "%s · ParkSmart",
  },
  description:
    "Find, predict and book parking in San Francisco with AI. Natural-language search, availability predictions, smart picks and instant booking.",
  applicationName: "ParkSmart",
  appleWebApp: { capable: true, title: "ParkSmart", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  openGraph: {
    title: "ParkSmart — AI parking for the Bay Area",
    description: "Tell ParkSmart where you're going. It finds the space most likely to be free, at the right price.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f9fc" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1430" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { user, profile } = await getSession().catch(() => ({ user: null, profile: null }));
  return (
    <html lang="en" className={jakarta.variable} suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-xl bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <Providers session={{ profile, email: user?.email ?? null }}>
          <SiteHeader />
          <main id="main" className="flex flex-1 flex-col">
            {children}
          </main>
          <BottomNav />
          <ChatWidget />
          <PwaRegister />
        </Providers>
      </body>
    </html>
  );
}
