"use client";

import { Loader2Icon, MapPinIcon, SearchIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { geocode, type GeocodeResult } from "@/lib/geocode";
import { cn } from "@/lib/utils";

/** Address / place autocomplete (Mapbox geocoding) — an accessible combobox. */
export function AddressSearch({
  onSelect,
  placeholder = "Search an address or place",
  proximity,
  defaultValue = "",
  className,
  inputClassName,
  invalid,
  id,
}: {
  onSelect: (place: GeocodeResult) => void;
  placeholder?: string;
  proximity?: { lat: number; lng: number } | null;
  defaultValue?: string;
  className?: string;
  inputClassName?: string;
  invalid?: boolean;
  id?: string;
}) {
  const listId = useId();
  const [query, setQuery] = useState(defaultValue);
  const [fetched, setResults] = useState<GeocodeResult[]>([]);
  const results = query.trim().length >= 3 ? fetched : [];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipNext = useRef(false);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const q = query.trim();
    if (q.length < 3) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await geocode(q, { proximity: proximity ?? undefined, signal: ctrl.signal });
        setResults(r);
        setOpen(true);
        setActive(-1);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Address search is unavailable right now");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, proximity]);

  function choose(r: GeocodeResult) {
    skipNext.current = true;
    setQuery(r.address || r.name);
    setOpen(false);
    onSelect(r);
  }

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          id={id}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!open || !results.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % results.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
            } else if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              choose(results[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className={cn(
            "h-11 w-full rounded-xl border border-input bg-card pr-10 pl-10 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm",
            inputClassName,
          )}
        />
        {loading && <Loader2Icon className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      {open && results.length > 0 && (
        <ul id={listId} role="listbox" className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border bg-popover p-1 shadow-lift">
          {results.map((r, i) => (
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
                <span className="block truncate text-xs text-muted-foreground">{r.address}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
