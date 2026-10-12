"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRightIcon, SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const EXAMPLE_QUERIES = [
  "Cheap covered parking near SFBU for 2 hours under $15, EV charging",
  "Garage near Oracle Park tonight at 6pm for 3 hours",
  "Wheelchair accessible parking near UCSF Parnassus",
  "Closest street parking to Ferry Building for 45 min",
  "Parking near Chase Center under $8/hr",
];

export function AiSearchBar({
  defaultValue = "",
  onSearch,
  loading,
  size = "lg",
  autoFocus,
  className,
}: {
  defaultValue?: string;
  /** When omitted, submitting navigates to /find?q=… */
  onSearch?: (query: string) => void;
  loading?: boolean;
  size?: "lg" | "md";
  autoFocus?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [exampleIdx, setExampleIdx] = useState(0);
  const reduced = useReducedMotion();

  // Follow the parent's query (e.g. after an AI search elsewhere) without an effect.
  const [prevDefault, setPrevDefault] = useState(defaultValue);
  if (prevDefault !== defaultValue) {
    setPrevDefault(defaultValue);
    setValue(defaultValue);
  }
  useEffect(() => {
    if (value || reduced) return;
    const t = setInterval(() => setExampleIdx((i) => (i + 1) % EXAMPLE_QUERIES.length), 3800);
    return () => clearInterval(t);
  }, [value, reduced]);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const q = value.trim();
    if (q.length < 2) {
      toast.error("Describe where you want to park", { description: `Try: “${EXAMPLE_QUERIES[0]}”` });
      return;
    }
    if (onSearch) onSearch(q);
    else router.push(`/find?q=${encodeURIComponent(q)}`);
  }

  return (
    <form onSubmit={submit} role="search" className={cn("relative w-full", className)}>
      <label htmlFor="ai-search" className="sr-only">
        Describe the parking you need
      </label>
      <div
        className={cn(
          "group relative flex items-center gap-2 rounded-2xl border bg-card shadow-lift transition-shadow focus-within:ring-4 focus-within:ring-teal/30",
          size === "lg" ? "p-2 pl-4" : "p-1.5 pl-3",
        )}
      >
        <SparklesIcon className={cn("shrink-0 text-teal-strong", size === "lg" ? "size-5" : "size-4")} aria-hidden />
        <div className="relative min-w-0 flex-1">
          <input
            id="ai-search"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus={autoFocus}
            autoComplete="off"
            enterKeyHint="search"
            maxLength={500}
            className={cn("w-full bg-transparent text-foreground outline-none placeholder:text-transparent", size === "lg" ? "h-12 text-base" : "h-10 text-[15px]")}
            placeholder={EXAMPLE_QUERIES[exampleIdx]}
          />
          {!value && (
            <div className="pointer-events-none absolute inset-0 flex items-center overflow-hidden" aria-hidden>
              <AnimatePresence mode="wait">
                <motion.span
                  key={exampleIdx}
                  initial={reduced ? false : { y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={reduced ? undefined : { y: -12, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className={cn("truncate text-muted-foreground", size === "lg" ? "text-base" : "text-[15px]")}
                >
                  {EXAMPLE_QUERIES[exampleIdx]}
                </motion.span>
              </AnimatePresence>
            </div>
          )}
        </div>
        <Button type="submit" variant="teal" size={size === "lg" ? "lg" : "default"} loading={loading} aria-label="Search with AI">
          <span className="hidden sm:inline">Search</span>
          <ArrowRightIcon />
        </Button>
      </div>
    </form>
  );
}
