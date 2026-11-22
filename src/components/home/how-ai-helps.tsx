"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  BarChart3Icon,
  BotIcon,
  DatabaseIcon,
  FileTextIcon,
  LineChartIcon,
  MessageCircleHeartIcon,
  MessageSquareTextIcon,
  SparklesIcon,
  TagIcon,
} from "lucide-react";
import Link from "next/link";

type Feature = { icon: typeof BotIcon; title: string; body: string; anim: string; href?: string };

const ML: Feature[] = [
  {
    icon: LineChartIcon,
    title: "Predicts parking availability",
    body: "Learns from historical occupancy, booking history, location, time of day and day of week to show the chance a space is free when you arrive, as a percentage.",
    anim: "chart",
    href: "/find",
  },
  {
    icon: BarChart3Icon,
    title: "Forecasts parking demand",
    body: "Finds the busiest locations and peak hours for the next 24 hours, so drivers can time their trip and owners can plan.",
    anim: "chart",
    href: "/insights",
  },
  {
    icon: TagIcon,
    title: "Suggests parking prices",
    body: "Owners get demand-based peak and off-peak prices from predicted demand, nearby rates and historical bookings.",
    anim: "pulse",
    href: "/host",
  },
];

const GENAI: Feature[] = [
  {
    icon: MessageSquareTextIcon,
    title: "Understands plain-English requests",
    body: "“Find parking near me for two hours under $15” becomes precise filters: place, duration, budget, covered, EV and more.",
    anim: "type",
    href: "/find?q=Find%20cheap%20parking%20near%20SFBU",
  },
  {
    icon: SparklesIcon,
    title: "Explains recommendations",
    body: "Tells you why a place is the AI Pick: price, walking distance and predicted availability compared with the alternatives.",
    anim: "pulse",
  },
  {
    icon: MessageCircleHeartIcon,
    title: "Summarises customer feedback",
    body: "Turns reviews into what drivers like, issues to fix and concrete improvements for owners and admins.",
    anim: "bounce",
  },
  {
    icon: FileTextIcon,
    title: "Writes daily reports",
    body: "Bookings, revenue, busiest locations, peak hours, availability trends and feedback highlights in one readable briefing.",
    anim: "type",
  },
];

const NO_AI = ["Sign-up and login", "Booking and reservations", "Stripe payment processing", "Directions and navigation", "Notifications and receipts"];

export function HowAiHelps() {
  const reduced = useReducedMotion();
  return (
    <section id="how-ai-helps" aria-labelledby="how-ai-title" className="mx-auto w-full max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold tracking-wide text-teal-strong uppercase">How AI helps</p>
        <h2 id="how-ai-title" className="mt-2 text-3xl font-bold sm:text-4xl">
          Two kinds of AI, each where it fits
        </h2>
        <p className="mt-4 text-muted-foreground">
          <strong className="text-foreground">Traditional machine learning</strong> works with numbers to make predictions.{" "}
          <strong className="text-foreground">Generative AI</strong> works with language to understand and explain. Everything else is ordinary, reliable software.
        </p>
      </div>

      <Group
        label="Traditional ML"
        subtitle="Predicts from historical data · outputs numbers"
        badge={<span className="rounded-full bg-navy px-2.5 py-0.5 text-xs font-semibold text-teal dark:bg-teal/15">Prediction</span>}
        features={ML}
        reduced={!!reduced}
        cols="lg:grid-cols-3"
      />
      <Group
        label="Generative AI"
        subtitle="Understands and writes language · outputs text"
        badge={<span className="rounded-full bg-gradient-to-r from-teal to-[oklch(0.86_0.12_160)] px-2.5 py-0.5 text-xs font-semibold text-teal-foreground">Language</span>}
        features={GENAI}
        reduced={!!reduced}
        cols="lg:grid-cols-4"
      />

      <div className="mt-12 rounded-2xl border border-dashed bg-card/60 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">No AI needed</h3>
          <p className="text-sm text-muted-foreground">Standard database operations and APIs are faster, cheaper and exact.</p>
        </div>
        <ul className="mt-4 flex flex-wrap gap-2">
          {NO_AI.map((x) => (
            <li key={x} className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm">
              <DatabaseIcon className="size-3.5 text-muted-foreground" aria-hidden /> {x}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          Also in ParkSmart: computer vision counts free bays from lot cameras and reads licence plates at check-in.{" "}
          <Link href="/ai-opportunities" className="font-medium text-foreground underline underline-offset-4">
            See the full AI opportunity map
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

function Group({
  label,
  subtitle,
  badge,
  features,
  reduced,
  cols,
}: {
  label: string;
  subtitle: string;
  badge: React.ReactNode;
  features: Feature[];
  reduced: boolean;
  cols: string;
}) {
  return (
    <div className="mt-12">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="text-xl font-bold">{label}</h3>
        {badge}
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className={`grid gap-4 sm:grid-cols-2 ${cols}`}>
        {features.map((f, i) => {
          const card = (
            <>
              <FeatureIcon icon={f.icon} anim={f.anim} reduced={reduced} />
              <h4 className="mt-5 font-semibold">{f.title}</h4>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              {f.href && <p className="mt-3 text-sm font-medium text-teal-strong">Try it →</p>}
            </>
          );
          return (
            <motion.article
              key={f.title}
              initial={reduced ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45, delay: (i % 4) * 0.07 }}
              whileHover={reduced ? undefined : { y: -4 }}
              className="group relative rounded-2xl border bg-card p-6 shadow-soft transition-shadow hover:shadow-lift"
            >
              {f.href ? (
                <Link href={f.href} className="block focus-visible:outline-none">
                  {card}
                </Link>
              ) : (
                card
              )}
            </motion.article>
          );
        })}
      </div>
    </div>
  );
}

function FeatureIcon({ icon: Icon, anim, reduced }: { icon: typeof BotIcon; anim: string; reduced: boolean }) {
  const loop = reduced
    ? {}
    : anim === "pulse"
      ? { animate: { scale: [1, 1.08, 1] }, transition: { repeat: Infinity, duration: 2.4 } }
      : anim === "bounce"
        ? { animate: { y: [0, -3, 0] }, transition: { repeat: Infinity, duration: 1.8 } }
        : anim === "chart"
          ? { animate: { rotate: [0, -4, 4, 0] }, transition: { repeat: Infinity, duration: 3.2 } }
          : {};
  return (
    <div className="relative flex size-12 items-center justify-center overflow-hidden rounded-2xl bg-navy text-teal dark:bg-teal/15">
      <motion.span {...loop} className="flex">
        <Icon className="size-6" aria-hidden />
      </motion.span>
      {(anim === "scan" || anim === "type") && !reduced && (
        <motion.span
          aria-hidden
          className="absolute inset-x-1 h-0.5 rounded-full bg-teal/80"
          animate={{ top: ["15%", "85%", "15%"] }}
          transition={{ repeat: Infinity, duration: 2.6, ease: "easeInOut" }}
        />
      )}
    </div>
  );
}
