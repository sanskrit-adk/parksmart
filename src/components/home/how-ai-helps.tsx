"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  BarChart3Icon,
  BotIcon,
  CameraIcon,
  LineChartIcon,
  MessageSquareTextIcon,
  ScanLineIcon,
  SparklesIcon,
  TagIcon,
} from "lucide-react";

const FEATURES = [
  {
    icon: MessageSquareTextIcon,
    title: "Search in plain English",
    body: "“Covered parking near SFBU for 2 hours under $15, EV charging” becomes precise filters and a geo search in under a second.",
    anim: "type",
  },
  {
    icon: LineChartIcon,
    title: "Availability prediction",
    body: "Every space shows its chance of being free when you arrive, from booking history, time of day and nearby events, plus a 24-hour forecast.",
    anim: "chart",
  },
  {
    icon: SparklesIcon,
    title: "AI Pick recommendations",
    body: "Results are ranked on price, walking distance, predicted availability, ratings and your preferences, with a one-line reason for each.",
    anim: "pulse",
  },
  {
    icon: BotIcon,
    title: "Parking assistant",
    body: "Chat to find, book, extend or cancel. It works against the app's real APIs and always asks you to confirm before anything is charged.",
    anim: "bounce",
  },
  {
    icon: CameraIcon,
    title: "Camera spot detection",
    body: "Lot operators upload a photo or camera snapshot. Computer vision counts free and occupied bays and flips the lot to Live.",
    anim: "scan",
  },
  {
    icon: ScanLineIcon,
    title: "Plate check-in",
    body: "Snap your licence plate on arrival and your booking starts automatically. Photos are never stored.",
    anim: "scan",
  },
  {
    icon: TagIcon,
    title: "Dynamic pricing for hosts",
    body: "Hosts get an hourly price suggestion from local demand, nearby rates and time of day, and can apply it with one tap.",
    anim: "pulse",
  },
  {
    icon: BarChart3Icon,
    title: "Daily AI insights",
    body: "Admins get a generated briefing on peak hours, busiest lots, revenue trends and anomalies such as no-shows.",
    anim: "chart",
  },
] as const;

export function HowAiHelps() {
  const reduced = useReducedMotion();
  return (
    <section id="how-ai-helps" aria-labelledby="how-ai-title" className="mx-auto w-full max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold tracking-wide text-teal-strong uppercase">How AI helps</p>
        <h2 id="how-ai-title" className="mt-2 text-3xl font-bold sm:text-4xl">
          Eight ways ParkSmart thinks ahead for you
        </h2>
        <p className="mt-4 text-muted-foreground">
          AI runs in every step, from the first search to check-in, and for the hosts and operators who run the spaces.
        </p>
      </div>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f, i) => (
          <motion.article
            key={f.title}
            initial={reduced ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45, delay: (i % 4) * 0.07 }}
            whileHover={reduced ? undefined : { y: -4 }}
            className="group rounded-2xl border bg-card p-6 shadow-soft transition-shadow hover:shadow-lift"
          >
            <FeatureIcon icon={f.icon} anim={f.anim} reduced={!!reduced} />
            <h3 className="mt-5 font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
          </motion.article>
        ))}
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
