"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  BarChart3Icon,
  BotIcon,
  CameraIcon,
  DatabaseIcon,
  FileTextIcon,
  LineChartIcon,
  MessageSquareQuoteIcon,
  MessageSquareTextIcon,
  SparklesIcon,
  TagIcon,
} from "lucide-react";

type Feature = { icon: typeof BotIcon; title: string; body: string; anim: string };

const GROUPS: { key: string; label: string; tagline: string; features: Feature[] }[] = [
  {
    key: "ml",
    label: "Traditional ML",
    tagline: "Learns patterns from historical numbers to predict what happens next.",
    features: [
      {
        icon: LineChartIcon,
        title: "Availability prediction",
        body: "Chance a space is free when you arrive, plus expected free spaces, from booking history, time of day, day of week and demand. Always shown separately from live counts.",
        anim: "chart",
      },
      {
        icon: BarChart3Icon,
        title: "Demand forecasting",
        body: "24-hour demand forecasts flag busy locations and peak hours for drivers and hosts.",
        anim: "chart",
      },
      {
        icon: TagIcon,
        title: "Price suggestions",
        body: "Hosts get a suggested hourly price from local demand, nearby rates and time of day, applied in one tap.",
        anim: "pulse",
      },
      {
        icon: CameraIcon,
        title: "Camera spot detection",
        body: "Computer vision counts free and occupied bays from a lot photo and flips the lot to Live.",
        anim: "scan",
      },
    ],
  },
  {
    key: "genai",
    label: "Generative AI",
    tagline: "Understands and writes natural language.",
    features: [
      {
        icon: MessageSquareTextIcon,
        title: "Search in plain English",
        body: "“Covered parking near SFBU for 2 hours under $15, EV charging” becomes precise search filters.",
        anim: "type",
      },
      {
        icon: SparklesIcon,
        title: "Recommendation explanations",
        body: "Every result says why it was picked: price, walking distance, predicted availability and your preferences.",
        anim: "pulse",
      },
      {
        icon: MessageSquareQuoteIcon,
        title: "Feedback summaries",
        body: "Customer reviews are condensed into what drivers like, what to fix and suggested improvements.",
        anim: "bounce",
      },
      {
        icon: FileTextIcon,
        title: "Daily reports",
        body: "Admins get a written daily report: bookings, revenue, busiest lots, peak hours, availability trends and feedback highlights.",
        anim: "type",
      },
    ],
  },
];

const NO_AI = ["Registration & login", "Booking a space", "Payment processing", "Navigation & directions"];

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
          Traditional machine learning predicts numbers. Generative AI understands and writes language. Everyday operations stay plain, reliable software.
        </p>
      </div>
      <div className="mt-12 space-y-10">
        {GROUPS.map((g) => (
          <div key={g.key}>
            <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-xl font-semibold">{g.label}</h3>
              <p className="text-sm text-muted-foreground">{g.tagline}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {g.features.map((f, i) => (
                <motion.article
                  key={f.title}
                  initial={reduced ? false : { opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.45, delay: i * 0.07 }}
                  whileHover={reduced ? undefined : { y: -4 }}
                  className="group rounded-2xl border bg-card p-6 shadow-soft transition-shadow hover:shadow-lift"
                >
                  <FeatureIcon icon={f.icon} anim={f.anim} reduced={!!reduced} />
                  <h4 className="mt-5 font-semibold">{f.title}</h4>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                </motion.article>
              ))}
            </div>
          </div>
        ))}
        <div className="rounded-2xl border border-dashed bg-muted/40 p-6">
          <h3 className="flex items-center gap-2 font-semibold">
            <DatabaseIcon className="size-5 text-teal-strong" aria-hidden /> No AI needed
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            These are standard database, payment and map operations. They are fast, predictable and secure without AI.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {NO_AI.map((n) => (
              <li key={n} className="rounded-full border bg-card px-3 py-1 text-sm">
                {n}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
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
