"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AccessibilityIcon, ClockIcon, CrosshairIcon, RefreshCwIcon, SlidersHorizontalIcon, SparklesIcon, UmbrellaIcon, ZapIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AddressSearch } from "@/components/address-search";
import { AiSearchBar } from "@/components/ai/ai-search-bar";
import { BottomSheet, type SnapPoint } from "@/components/bottom-sheet";
import { EmptyState } from "@/components/empty-state";
import { FiltersPanel, type EditableFilters } from "@/components/find/filters-panel";
import { LazyParkingMap, type Bounds } from "@/components/map/lazy-map";
import { LocationCard, LocationCardSkeleton } from "@/components/parking/location-card";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useGeolocation } from "@/hooks/use-geolocation";
import { api } from "@/lib/fetcher";
import { duration, money } from "@/lib/format";
import { haversine, SF_CENTER } from "@/lib/geo";
import { createClient } from "@/lib/supabase/client";
import type { MapLocation, RankedLocation, SearchFilters } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AiResponse {
  engine: "ai" | "rules";
  summary: string;
  filters: SearchFilters;
  place: { name: string; address: string; lat: number; lng: number } | null;
  usedUserLocation: boolean;
  results: RankedLocation[];
  widened: boolean;
}

const DEFAULT_EDITABLE: EditableFilters = {
  radius_m: 2000,
  duration_hours: 2,
  arrive_at: null,
  max_price_per_hour: null,
  covered: null,
  ev_charging: null,
  accessible: null,
  open_now: false,
  types: null,
  sort: "best",
};

export function FindParking({ initialQuery, favoriteIds }: { initialQuery: string | null; favoriteIds: string[] }) {
  const router = useRouter();
  const geo = useGeolocation({ auto: !initialQuery });
  const favorites = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const [query, setQuery] = useState(initialQuery ?? "");
  const [aiInfo, setAiInfo] = useState<{ engine: "ai" | "rules"; summary: string; maxTotal: number | null } | null>(null);
  const maxTotal = aiInfo?.maxTotal ?? null;
  const [filters, setFilters] = useState<EditableFilters>(DEFAULT_EDITABLE);
  const [origin, setOrigin] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [results, setResults] = useState<RankedLocation[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [widened, setWidened] = useState(false);
  const [mapLocations, setMapLocations] = useState<MapLocation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [fitPoints, setFitPoints] = useState<{ lat: number; lng: number }[] | null>(null);
  // Camera target: an explicit "my location" tap wins, then the GPS fix, then downtown SF.
  const [pickedCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const mapCenter = pickedCenter ?? geo.position ?? SF_CENTER;
  const [movedBounds, setMovedBounds] = useState<Bounds | null>(null);
  const [snap, setSnap] = useState<SnapPoint>("peek");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [liveFlash, setLiveFlash] = useState(0);
  const started = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------- searches
  const showResults = useCallback((rows: RankedLocation[], center: { lat: number; lng: number }) => {
    setResults(rows);
    setStatus("done");
    setSelectedId(null);
    setFitPoints([center, ...rows.slice(0, 6).map((r) => ({ lat: r.lat, lng: r.lng }))]);
    setMovedBounds(null);
    setSnap((s) => (s === "peek" ? "half" : s));
    listRef.current?.scrollTo({ top: 0 });
  }, []);

  const runAi = useCallback(
    async (q: string) => {
      setQuery(q);
      setStatus("loading");
      setError(null);
      try {
        const res = await api<AiResponse>("/api/ai/search", { json: { query: q, lat: geo.position?.lat ?? null, lng: geo.position?.lng ?? null } });
        const f = res.filters;
        setFilters({
          radius_m: f.radius_m,
          duration_hours: f.duration_hours,
          arrive_at: f.arrive_at,
          max_price_per_hour: f.max_price_per_hour,
          covered: f.covered,
          ev_charging: f.ev_charging,
          accessible: f.accessible,
          open_now: f.open_now,
          types: f.types,
          sort: f.sort,
        });
        setAiInfo({ engine: res.engine, summary: res.summary, maxTotal: f.max_total_price });
        const center = res.place ?? { lat: f.lat ?? SF_CENTER.lat, lng: f.lng ?? SF_CENTER.lng, name: res.usedUserLocation ? "you" : "downtown SF" };
        setOrigin({ lat: center.lat, lng: center.lng, name: "name" in center ? center.name : "you" });
        setWidened(res.widened);
        showResults(res.results, center);
        const url = new URL(window.location.href);
        url.searchParams.set("q", q);
        window.history.replaceState(null, "", url);
      } catch (e) {
        setStatus("error");
        setSnap("half");
        setError((e as Error).message);
        toast.error("Search failed", { description: (e as Error).message });
      }
    },
    [geo.position, showResults],
  );

  const runStructured = useCallback(
    async (f: EditableFilters, center: { lat: number; lng: number; name: string }, opts: { keepAi?: boolean } = {}) => {
      setStatus("loading");
      setError(null);
      setOrigin(center);
      if (!opts.keepAi) setAiInfo((a) => (a ? { ...a, summary: `Parking near ${center.name}` } : null));
      try {
        const res = await api<{ results: RankedLocation[]; widened: boolean }>("/api/search", {
          json: { ...f, lat: center.lat, lng: center.lng, max_total_price: maxTotal },
        });
        setWidened(res.widened);
        showResults(res.results, center);
      } catch (e) {
        setStatus("error");
        setSnap("half");
        setError((e as Error).message);
        toast.error("Couldn't load parking", { description: (e as Error).message });
      }
    },
    [maxTotal, showResults],
  );

  // ---------------------------------------------------------------- startup
  // Runs the first search once we know where to search: the URL query, or the
  // geolocation result. Starting a fetch here is the effect's purpose.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (started.current) return;
    if (initialQuery) {
      started.current = true;
      void runAi(initialQuery);
      return;
    }
    if (geo.status === "ready" && geo.position) {
      started.current = true;
      void runStructured(DEFAULT_EDITABLE, { ...geo.position, name: "you" });
    } else if (geo.status === "denied" || geo.status === "unavailable") {
      started.current = true;
      toast.info("Location is off", { description: "Showing downtown San Francisco. Search an address or ask the AI instead." });
      void runStructured(DEFAULT_EDITABLE, { ...SF_CENTER, name: "downtown SF" });
    }
  }, [geo.status, geo.position, initialQuery, runAi, runStructured]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ---------------------------------------------------------------- map data
  const loadBounds = useCallback(
    async (b: Bounds) => {
      if (b.zoom < 10) return;
      const params = new URLSearchParams({
        minLng: String(b.minLng),
        minLat: String(b.minLat),
        maxLng: String(b.maxLng),
        maxLat: String(b.maxLat),
      });
      if (filters.max_price_per_hour) params.set("maxPrice", String(filters.max_price_per_hour));
      if (filters.covered) params.set("covered", "true");
      if (filters.ev_charging) params.set("ev", "true");
      if (filters.accessible) params.set("accessible", "true");
      try {
        const res = await api<{ locations: MapLocation[] }>(`/api/locations/bounds?${params}`);
        setMapLocations(res.locations);
      } catch {
        /* the list still works; the map just keeps the previous markers */
      }
    },
    [filters.max_price_per_hour, filters.covered, filters.ev_charging, filters.accessible],
  );

  const onBoundsChange = useCallback(
    (b: Bounds) => {
      void loadBounds(b);
      if (origin) {
        const c = { lat: (b.minLat + b.maxLat) / 2, lng: (b.minLng + b.maxLng) / 2 };
        setMovedBounds(haversine(c, origin) > Math.max(700, filters.radius_m * 0.6) ? b : null);
      }
    },
    [loadBounds, origin, filters.radius_m],
  );

  // ---------------------------------------------------------------- realtime
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("availability")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "parking_locations" }, (payload) => {
        const n = payload.new as { id: string; available_now: number | null; availability_mode: "live" | "estimated" | null; hourly_price: number };
        setMapLocations((prev) =>
          prev.map((l) => (l.id === n.id ? { ...l, available_now: n.available_now, availability_mode: n.availability_mode, hourly_price: Number(n.hourly_price) } : l)),
        );
        setResults((prev) => {
          if (!prev.some((r) => r.id === n.id)) return prev;
          setLiveFlash((x) => x + 1);
          return prev.map((r) => (r.id === n.id ? { ...r, available_now: n.available_now, availability_mode: n.availability_mode } : r));
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Merge result rows into map rows so every result has a marker.
  const mapRows = useMemo(() => {
    const byId = new Map(mapLocations.map((l) => [l.id, l]));
    for (const r of results) {
      if (!byId.has(r.id)) {
        byId.set(r.id, {
          id: r.id, name: r.name, type: r.type, hourly_price: r.hourly_price, price_estimated: r.price_estimated,
          total_spots: r.total_spots, available_now: r.available_now, availability_mode: r.availability_mode, lat: r.lat, lng: r.lng,
        });
      }
    }
    return [...byId.values()];
  }, [mapLocations, results]);
  const highlightIds = useMemo(() => new Set(results.map((r) => r.id)), [results]);

  // ---------------------------------------------------------------- actions
  function applyFilters(next: EditableFilters) {
    setFilters(next);
    setFiltersOpen(false);
    const center = origin ?? { ...SF_CENTER, name: "downtown SF" };
    void runStructured(next, center, { keepAi: true });
  }

  function toggleQuick(key: "covered" | "ev_charging" | "accessible" | "open_now") {
    const next = { ...filters, [key]: key === "open_now" ? !filters.open_now : filters[key] ? null : true } as EditableFilters;
    applyFilters(next);
  }

  async function useMyLocation() {
    const pos = await geo.request();
    if (!pos) {
      toast.error(geo.status === "denied" ? "Location permission is blocked" : "Couldn't get your location", {
        description: "Enable location in your browser settings, or search an address.",
      });
      return;
    }
    setMapCenter(pos);
    void runStructured(filters, { ...pos, name: "you" });
  }

  function selectOnMap(id: string) {
    setSelectedId(id);
    setSnap((s) => (s === "peek" ? "half" : s));
    const inList = results.some((r) => r.id === id);
    if (inList) {
      document.getElementById(`result-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      router.push(`/spots/${id}`);
    }
  }

  const bookingQuery = filters.arrive_at ? `start=${encodeURIComponent(filters.arrive_at)}` : "";

  // ---------------------------------------------------------------- render pieces
  const summaryLine = (
    <div className="space-y-2">
      <AnimatePresence mode="wait">
        {aiInfo && (
          <motion.div
            key={aiInfo.summary}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 rounded-xl bg-accent/70 px-3 py-2 text-sm text-accent-foreground"
          >
            <SparklesIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              <span className="font-semibold">{aiInfo.engine === "ai" ? "AI understood: " : "Searching: "}</span>
              {aiInfo.summary}
              {" · "}
              {duration(filters.duration_hours)}
              {filters.max_price_per_hour ? ` · ≤ ${money(filters.max_price_per_hour, { compact: true })}/hr` : ""}
              {aiInfo.maxTotal ? ` · ≤ ${money(aiInfo.maxTotal, { compact: true })} total` : ""}
              {aiInfo.engine === "rules" && <span className="block text-xs opacity-75">Basic parser (AI key not configured)</span>}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {status === "loading"
            ? "Finding the best spots…"
            : status === "done"
              ? `${results.length} option${results.length === 1 ? "" : "s"} near ${origin?.name ?? "you"}${widened ? " (search widened)" : ""}`
              : ""}
        </p>
        <AnimatePresence>
          {liveFlash > 0 && (
            <motion.span key={liveFlash} initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 2.5 }} className="text-xs font-medium text-free">
              ● Updated live
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  const chips = (
    <div className="scrollbar-none -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
      <Button variant="outline" size="sm" onClick={() => setFiltersOpen(true)} className="rounded-full">
        <SlidersHorizontalIcon /> Filters
      </Button>
      <NativeSelect
        aria-label="Sort results"
        value={filters.sort}
        onChange={(e) => applyFilters({ ...filters, sort: e.target.value as EditableFilters["sort"] })}
        className="w-36 shrink-0 [&_select]:h-9 [&_select]:rounded-full [&_select]:text-sm"
      >
        <option value="best">Sort: AI best</option>
        <option value="price">Sort: Price</option>
        <option value="distance">Sort: Distance</option>
        <option value="availability">Sort: Availability</option>
      </NativeSelect>
      <Chip active={!!filters.covered} onClick={() => toggleQuick("covered")} icon={UmbrellaIcon} label="Covered" />
      <Chip active={!!filters.ev_charging} onClick={() => toggleQuick("ev_charging")} icon={ZapIcon} label="EV" />
      <Chip active={!!filters.accessible} onClick={() => toggleQuick("accessible")} icon={AccessibilityIcon} label="Accessible" />
      <Chip active={filters.open_now} onClick={() => toggleQuick("open_now")} icon={ClockIcon} label="Open now" />
    </div>
  );

  const list = (
    <div ref={listRef} className="space-y-3">
      {status === "loading" && Array.from({ length: 4 }, (_, i) => <LocationCardSkeleton key={i} />)}
      {status === "error" && (
        <EmptyState
          art="map"
          title="We couldn't load parking"
          description={error ?? "Please try again."}
          action={
            <Button onClick={() => (query ? runAi(query) : runStructured(filters, origin ?? { ...SF_CENTER, name: "downtown SF" }))}>
              <RefreshCwIcon /> Try again
            </Button>
          }
        />
      )}
      {status === "done" && results.length === 0 && (
        <EmptyState
          art="search"
          title="No parking matches yet"
          description="Try a higher price limit, a bigger distance, or fewer amenities."
          action={<Button onClick={() => applyFilters({ ...DEFAULT_EDITABLE, duration_hours: filters.duration_hours })}>Clear filters</Button>}
        />
      )}
      {status === "idle" && (
        <EmptyState
          art="map"
          title="Where are you headed?"
          description="Allow location access, search an address, or describe what you need to the AI."
          action={
            <Button variant="teal" onClick={useMyLocation} loading={geo.status === "locating"}>
              <CrosshairIcon /> Use my location
            </Button>
          }
        />
      )}
      {status === "done" &&
        results.map((r) => (
          <div key={r.id} id={`result-${r.id}`}>
            <LocationCard
              location={r}
              selected={selectedId === r.id}
              favorite={favorites.has(r.id)}
              durationHours={filters.duration_hours}
              onHover={setHoveredId}
              bookingQuery={bookingQuery}
            />
          </div>
        ))}
    </div>
  );

  return (
    <div className="relative flex h-[calc(100dvh-4rem)] overflow-hidden">
      {/* Desktop list pane */}
      <aside className="hidden w-[min(460px,42vw)] shrink-0 flex-col border-r bg-background md:flex">
        <div className="space-y-3 border-b p-4">
          <AiSearchBar defaultValue={query} onSearch={runAi} loading={status === "loading" && !!query} size="md" />
          <div className="flex gap-2">
            <AddressSearch
              className="flex-1"
              placeholder="Or search an address"
              proximity={geo.position}
              onSelect={(p) => {
                setQuery("");
                setAiInfo(null);
                void runStructured(filters, { lat: p.lat, lng: p.lng, name: p.name });
              }}
            />
            <Button variant="outline" size="icon" className="size-11" onClick={useMyLocation} loading={geo.status === "locating"} aria-label="Use my location">
              <CrosshairIcon />
            </Button>
          </div>
          {chips}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {summaryLine}
          <div className="mt-3">{list}</div>
        </div>
      </aside>

      {/* Map */}
      <div className="relative flex-1">
        <LazyParkingMap
          className="absolute inset-0"
          locations={mapRows}
          center={mapCenter}
          zoom={14}
          userPosition={geo.position}
          destination={origin && origin.name !== "you" ? origin : null}
          selectedId={selectedId}
          hoveredId={hoveredId}
          highlightIds={highlightIds}
          fitPoints={fitPoints}
          onSelect={selectOnMap}
          onBoundsChange={onBoundsChange}
          bottomInset={typeof window !== "undefined" && window.innerWidth < 768 ? Math.round(window.innerHeight * 0.45) : 0}
        />

        {/* Mobile top controls */}
        <div className="absolute inset-x-3 top-3 z-20 space-y-2 md:hidden">
          <AiSearchBar defaultValue={query} onSearch={runAi} loading={status === "loading" && !!query} size="md" />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="rounded-full shadow-soft" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontalIcon /> Filters
            </Button>
            <Button variant="outline" size="sm" className="rounded-full shadow-soft" onClick={useMyLocation} loading={geo.status === "locating"}>
              <CrosshairIcon /> My location
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {movedBounds && status !== "loading" && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute top-32 left-1/2 z-20 -translate-x-1/2 md:top-4"
            >
              <Button
                className="rounded-full shadow-lift"
                onClick={() =>
                  runStructured(filters, { lat: (movedBounds.minLat + movedBounds.maxLat) / 2, lng: (movedBounds.minLng + movedBounds.maxLng) / 2, name: "this area" })
                }
              >
                <RefreshCwIcon /> Search this area
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Legend */}
        <div className="absolute bottom-6 left-3 z-10 hidden gap-3 rounded-xl bg-card/90 px-3 py-2 text-xs shadow-soft backdrop-blur md:flex">
          <Legend className="bg-free" label="Free" />
          <Legend className="bg-filling" label="Filling up" />
          <Legend className="bg-full" label="Full" />
          <span className="text-muted-foreground">~ = estimated price</span>
        </div>
      </div>

      {/* Mobile results sheet */}
      <BottomSheet snap={snap} onSnapChange={setSnap} header={summaryLine}>
        <div className="mb-3">{chips}</div>
        {list}
      </BottomSheet>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Fine-tune what the AI ranks for you.</SheetDescription>
          </SheetHeader>
          <div className="space-y-6 px-4 pb-6">
            <div className="space-y-2 md:hidden">
              <p className="text-sm font-medium">Search near an address</p>
              <AddressSearch
                proximity={geo.position}
                onSelect={(p) => {
                  setFiltersOpen(false);
                  setQuery("");
                  setAiInfo(null);
                  void runStructured(filters, { lat: p.lat, lng: p.lng, name: p.name });
                }}
              />
            </div>
            <FiltersPanel key={JSON.stringify(filters)} value={filters} onApply={applyFilters} onCancel={() => setFiltersOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Chip({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof ZapIcon; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-medium transition-colors hover:bg-muted",
        active && "border-teal-strong bg-accent text-accent-foreground hover:bg-accent",
      )}
    >
      <Icon className="size-4" aria-hidden /> {label}
    </button>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-full", className)} /> {label}
    </span>
  );
}
