"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRightIcon, Loader2Icon, MapPinIcon, SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { geocode, type GeocodeResult } from "@/lib/geocode";
import { cn } from "@/lib/utils";

/** Words that mean "this is a request, not a place" — no place suggestions for those. */
const REQUEST_WORDS = /\b(under|below|cheap|cheapest|closest|nearest|covered|ev|charging|accessible|wheelchair|tonight|tomorrow|hours?|hrs?|minutes?|mins?)\b|\$/i;

/** The place part of a query: "parking near Ferry Building" → "Ferry Building"; a bare address as is. */
function placePart(q: string) {
  const m = q.match(/\b(?:near|by|close to|around|at)\s+(.+)$/i);
  const part = (m ? m[1] : q).trim();
  if (part.length < 3 || part.length > 80 || REQUEST_WORDS.test(part)) return null;
  if (!m && /^(?:find|show|get|need|cheap|parking|park)\b/i.test(part)) return null;
  return part;
}

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
  onPlaceSelect,
  proximity,
  loading,
  size = "lg",
  autoFocus,
  className,
}: {
  defaultValue?: string;
  /** When omitted, submitting navigates to /find?q=… */
  onSearch?: (query: string) => void;
  /** Called when the user picks a place suggestion; when omitted it navigates to /find?q=<address>. */
  onPlaceSelect?: (place: GeocodeResult) => void;
  /** Bias place suggestions toward this point. */
  proximity?: { lat: number; lng: number } | null;
  loading?: boolean;
  size?: "lg" | "md";
  autoFocus?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [exampleIdx, setExampleIdx] = useState(0);
  const reduced = useReducedMotion();
  const listId = useId();
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [suggestFor, setSuggestFor] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [suggesting, setSuggesting] = useState(false);
  const skipNext = useRef(false);
  const part = placePart(value);
  const shown = open && part && suggestFor === part ? suggestions : [];

  // Place suggestions as you type (debounced, latest request wins).
  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    if (!part) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setSuggesting(true);
      try {
        const r = await geocode(part, { proximity: proximity ?? undefined, limit: 5, signal: ctrl.signal });
        if (ctrl.signal.aborted) return;
        setSuggestions(r);
        setSuggestFor(part);
        setActive(-1);
      } catch {
        // Suggestions are a convenience; the AI search still works.
      } finally {
        if (!ctrl.signal.aborted) setSuggesting(false);
      }
    }, 220);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [part, proximity]);

  function choose(r: GeocodeResult) {
    const label = r.address || r.name;
    skipNext.current = true;
    setValue(label);
    setOpen(false);
    if (onPlaceSelect) onPlaceSelect(r);
    else router.push(`/find?q=${encodeURIComponent(label)}`);
  }

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
    if (active >= 0 && shown[active]) return choose(shown[active]);
    setOpen(false);
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
            onChange={(e) => {
              setValue(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (!shown.length) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => (a + 1) % shown.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => (a <= 0 ? shown.length - 1 : a - 1));
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            role="combobox"
            aria-expanded={shown.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
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
        {suggesting && open && part && <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />}
        <Button type="submit" variant="teal" size={size === "lg" ? "lg" : "default"} loading={loading} aria-label="Search with AI">
          <span className="hidden sm:inline">Search</span>
          <ArrowRightIcon />
        </Button>
      </div>
      {shown.length > 0 && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border bg-popover p-1 shadow-lift">
          {shown.map((r, i) => (
            <li
              key={r.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(r);
              }}
              className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm", i === active ? "bg-accent" : "hover:bg-muted")}
            >
              <MapPinIcon className="mt-0.5 size-4 shrink-0 text-teal-strong" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate font-medium">{r.name}</span>
                {r.address && r.address !== r.name && <span className="block truncate text-xs text-muted-foreground">{r.address}</span>}
              </span>
            </li>
          ))}
          <li
            role="option"
            aria-selected={false}
            onMouseDown={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted"
          >
            <SparklesIcon className="size-4 shrink-0 text-teal-strong" aria-hidden />
            <span className="truncate">Search with AI: “{value.trim()}”</span>
          </li>
        </ul>
      )}
    </form>
  );
}
