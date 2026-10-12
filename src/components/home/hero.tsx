"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CrosshairIcon, FootprintsIcon, SparklesIcon, TrendingUpIcon } from "lucide-react";
import Link from "next/link";
import { AiSearchBar, EXAMPLE_QUERIES } from "@/components/ai/ai-search-bar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Hero() {
  const reduced = useReducedMotion();
  return (
    <section className="relative overflow-hidden bg-navy text-navy-foreground dark:bg-[oklch(0.19_0.05_266)]">
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" aria-hidden />
      <div className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-teal/25 blur-3xl" aria-hidden />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pt-16 pb-24 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:pt-24 lg:pb-32">
        <div>
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm text-white/80"
          >
            <SparklesIcon className="size-4 text-teal" /> AI parking for the San Francisco Bay Area
          </motion.p>
          <motion.h1
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mt-5 text-4xl leading-[1.05] font-extrabold sm:text-5xl lg:text-6xl"
          >
            Know you&apos;ll get a space <span className="bg-linear-to-r from-teal via-[oklch(0.88_0.1_160)] to-teal bg-clip-text text-transparent">before you leave.</span>
          </motion.h1>
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-5 max-w-xl text-lg text-white/75"
          >
            Tell ParkSmart where you&apos;re going. It predicts which spaces will be free when you arrive, picks the best one for your budget, and books it in a tap.
          </motion.p>
          <motion.div initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-8 text-foreground">
            <AiSearchBar />
          </motion.div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link href="/find" className={cn(buttonVariants({ variant: "teal", size: "lg" }))}>
              <CrosshairIcon /> Find parking near me
            </Link>
            <span className="text-sm text-white/60">or try:</span>
            {EXAMPLE_QUERIES.slice(1, 3).map((q) => (
              <Link
                key={q}
                href={`/find?q=${encodeURIComponent(q)}`}
                className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/10"
              >
                {q.split(" ").slice(0, 4).join(" ")}…
              </Link>
            ))}
          </div>
        </div>

        <motion.div
          initial={reduced ? false : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="relative hidden lg:block"
          aria-hidden
        >
          <PreviewCard />
        </motion.div>
      </div>
    </section>
  );
}

/** Illustrative product preview (not live data). */
function PreviewCard() {
  const reduced = useReducedMotion();
  return (
    <div className="relative">
      <motion.div
        animate={reduced ? undefined : { y: [0, -6, 0] }}
        transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
        className="rounded-3xl border border-white/10 bg-white p-5 text-[oklch(0.22_0.04_266)] shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-teal to-[oklch(0.86_0.12_160)] px-2.5 py-1 text-xs font-semibold text-navy">
            <SparklesIcon className="size-3" /> AI Pick
          </span>
          <span className="text-xl font-bold">
            $4.50<span className="text-xs font-medium text-slate-500">/hr</span>
          </span>
        </div>
        <p className="mt-3 text-lg font-semibold">Mission Bay garage</p>
        <p className="text-sm text-slate-500">Example result</p>
        <p className="mt-3 flex gap-1.5 text-sm">
          <SparklesIcon className="mt-0.5 size-3.5 shrink-0 text-[oklch(0.5_0.1_192)]" />
          Closest under $5/hr with 91% chance of being free
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
            <TrendingUpIcon className="size-3.5" /> 91% likely free
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
            <FootprintsIcon className="size-3.5" /> 4 min walk
          </span>
        </div>
        <div className="mt-5 flex h-16 items-end gap-1">
          {[40, 55, 72, 88, 92, 85, 70, 52, 45, 60, 74, 66].map((h, i) => (
            <motion.span
              key={i}
              className={cn("flex-1 rounded-t", i === 4 ? "bg-[oklch(0.5_0.1_192)]" : "bg-slate-200")}
              initial={reduced ? false : { height: 0 }}
              animate={{ height: `${h}%` }}
              transition={{ delay: 0.4 + i * 0.04 }}
            />
          ))}
        </div>
        <p className="mt-1 text-[11px] text-slate-500">24-hour occupancy forecast</p>
      </motion.div>
      <motion.div
        animate={reduced ? undefined : { y: [0, 8, 0] }}
        transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
        className="absolute -bottom-8 -left-10 rounded-2xl border border-white/10 bg-[oklch(0.3_0.07_266)] px-4 py-3 text-sm text-white shadow-xl"
      >
        <p className="flex items-center gap-2 font-medium">
          <span className="size-2 rounded-full bg-free" /> 3 spaces just opened nearby
        </p>
        <p className="text-xs text-white/60">Example live update</p>
      </motion.div>
    </div>
  );
}
