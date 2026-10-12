"use client";

import type mapboxgl from "mapbox-gl";
import type { GeoJSONSource, LngLatBoundsLike } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "next-themes";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { availabilityLevel } from "@/components/parking/availability";
import { LABEL_FONT, loadMapEngine, MAP_STYLES, type MapEngine } from "@/lib/map-engine";
import type { MapLocation } from "@/lib/types";

export interface Bounds {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
  zoom: number;
}

export interface ParkingMapProps {
  locations: MapLocation[];
  center: { lat: number; lng: number };
  zoom?: number;
  userPosition?: { lat: number; lng: number } | null;
  destination?: { lat: number; lng: number; name?: string } | null;
  selectedId?: string | null;
  hoveredId?: string | null;
  highlightIds?: Set<string>;
  fitPoints?: { lat: number; lng: number }[] | null;
  onSelect?: (id: string) => void;
  onBoundsChange?: (b: Bounds) => void;
  /** Extra bottom padding (px) when a sheet covers part of the map. */
  bottomInset?: number;
  className?: string;
}

const LEVEL_CLASS = {
  free: "bg-[var(--free)] text-white",
  filling: "bg-[var(--filling)] text-[#1f1300]",
  full: "bg-[var(--full)] text-white",
} as const;

export default function ParkingMap(props: ParkingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef(new Map<string, { marker: mapboxgl.Marker; el: HTMLButtonElement }>());
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const destMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const glRef = useRef<MapEngine | null>(null);
  const [ready, setReady] = useState(false);
  // Map event handlers are registered once; they read the latest props through this ref.
  const propsRef = useRef(props);
  useLayoutEffect(() => {
    propsRef.current = props;
  });
  const { resolvedTheme } = useTheme();
  const themeRef = useRef(resolvedTheme);

  // --- init -----------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let teardown = () => {};
    loadMapEngine()
      .then((gl) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        glRef.current = gl;
        teardown = init(gl, containerRef.current);
        setReady(true);
      })
      .catch((err) => console.error("Map failed to load", err));
    return () => {
      cancelled = true;
      teardown();
    };

    function init(mapboxgl: MapEngine, container: HTMLDivElement) {
    const p = propsRef.current;
    const map = new mapboxgl.Map({
      container,
      style: themeRef.current === "dark" ? MAP_STYLES.dark : MAP_STYLES.light,
      center: [p.center.lng, p.center.lat],
      zoom: p.zoom ?? 14,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    const addLayers = () => {
      if (map.getSource("locations")) return;
      map.addSource("locations", {
        type: "geojson",
        data: toGeoJSON(propsRef.current.locations),
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 48,
      });
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "locations",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": themeRef.current === "dark" ? "#5ee0d2" : "#152a5c",
          "circle-opacity": 0.92,
          "circle-radius": ["step", ["get", "point_count"], 18, 10, 22, 50, 28, 200, 34],
          "circle-stroke-width": 4,
          "circle-stroke-color": themeRef.current === "dark" ? "rgba(94,224,210,0.3)" : "rgba(21,42,92,0.18)",
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "locations",
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 13, "text-font": LABEL_FONT },
        paint: { "text-color": themeRef.current === "dark" ? "#0d1430" : "#ffffff" },
      });
    };

    map.on("style.load", addLayers);
    map.on("click", "clusters", (e) => {
      const feature = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
      const clusterId = feature?.properties?.cluster_id;
      const source = map.getSource("locations") as GeoJSONSource | undefined;
      if (clusterId === undefined || !source) return;
      const zoomTo = (zoom: number) => map.easeTo({ center: (feature.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
      // Mapbox takes a callback; MapLibre returns a Promise.
      const r = source.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (!err && zoom != null) zoomTo(zoom);
      }) as unknown;
      if (r instanceof Promise) r.then(zoomTo).catch(() => undefined);
    });
    map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
    map.on("render", () => {
      if (map.getSource("locations") && map.isSourceLoaded("locations")) syncMarkers();
    });

    let t: ReturnType<typeof setTimeout>;
    const emitBounds = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const b = map.getBounds();
        if (!b) return;
        propsRef.current.onBoundsChange?.({ minLng: b.getWest(), minLat: b.getSouth(), maxLng: b.getEast(), maxLat: b.getNorth(), zoom: map.getZoom() });
      }, 350);
    };
    map.on("moveend", emitBounds);
    map.on("load", emitBounds);

    function syncMarkers() {
      const { selectedId, hoveredId, highlightIds } = propsRef.current;
      const seen = new Set<string>();
      for (const f of map.querySourceFeatures("locations")) {
        const pr = f.properties as Record<string, unknown> | null;
        if (!pr || pr.cluster) continue;
        const id = String(pr.id);
        if (seen.has(id)) continue;
        seen.add(id);
        let entry = markersRef.current.get(id);
        if (!entry) {
          const el = document.createElement("button");
          el.type = "button";
          el.addEventListener("click", (ev) => {
            ev.stopPropagation();
            propsRef.current.onSelect?.(id);
          });
          const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
            .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
            .addTo(map);
          entry = { marker, el };
          markersRef.current.set(id, entry);
        }
        const price = Number(pr.price);
        const available = pr.available === null || pr.available === undefined || pr.available === "" ? null : Number(pr.available);
        const level = availabilityLevel(available, Number(pr.total));
        const isSelected = selectedId === id || hoveredId === id;
        const dimmed = highlightIds && highlightIds.size > 0 && !highlightIds.has(id);
        const label = price === 0 ? "Free" : `${pr.estimated ? "~" : ""}$${price % 1 === 0 ? price : price.toFixed(2)}`;
        entry.el.textContent = label;
        entry.el.setAttribute(
          "aria-label",
          `${pr.name}, ${price === 0 ? "free" : `$${price.toFixed(2)} per hour`}, ${available === null ? "availability unknown" : available <= 0 ? "full" : `${available} spaces free`}${pr.mode === "live" ? ", live" : ", estimated"}`,
        );
        entry.el.className = [
          "relative rounded-full px-2.5 py-1 text-xs font-bold shadow-md ring-2 ring-white transition-transform duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)] dark:ring-[#0d1430]",
          "after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-4 after:border-transparent",
          level === "free" ? "after:border-t-[var(--free)]" : level === "filling" ? "after:border-t-[var(--filling)]" : "after:border-t-[var(--full)]",
          LEVEL_CLASS[level],
          isSelected ? "z-20 scale-125" : "hover:scale-110",
          dimmed ? "opacity-45" : "",
        ].join(" ");
        entry.el.style.zIndex = isSelected ? "20" : dimmed ? "0" : "5";
      }
      for (const [id, entry] of markersRef.current) {
        if (!seen.has(id)) {
          entry.marker.remove();
          markersRef.current.delete(id);
        }
      }
    }

    const markers = markersRef.current;
    return () => {
      clearTimeout(t);
      markers.forEach(({ marker }) => marker.remove());
      markers.clear();
      map.remove();
      mapRef.current = null;
    };
    }
  }, []);

  // --- data -----------------------------------------------------------------
  useEffect(() => {
    const src = mapRef.current?.getSource("locations") as GeoJSONSource | undefined;
    src?.setData(toGeoJSON(props.locations));
  }, [props.locations, ready]);

  // Selection / hover / highlight changes need a marker restyle.
  useEffect(() => {
    mapRef.current?.triggerRepaint();
  }, [props.selectedId, props.hoveredId, props.highlightIds]);

  // --- theme ----------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || themeRef.current === resolvedTheme) return;
    themeRef.current = resolvedTheme;
    markersRef.current.forEach(({ marker }) => marker.remove());
    markersRef.current.clear();
    map.setStyle(resolvedTheme === "dark" ? MAP_STYLES.dark : MAP_STYLES.light);
  }, [resolvedTheme]);

  // --- camera ---------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ center: [props.center.lng, props.center.lat], zoom: props.zoom ?? map.getZoom(), duration: 600 });
  }, [props.center.lat, props.center.lng, props.zoom, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const pts = props.fitPoints;
    if (!map || !pts || pts.length === 0) return;
    if (pts.length === 1) {
      map.easeTo({ center: [pts[0].lng, pts[0].lat], zoom: 15, duration: 600 });
      return;
    }
    const lngs = pts.map((p) => p.lng);
    const lats = pts.map((p) => p.lat);
    const bounds: LngLatBoundsLike = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ];
    map.fitBounds(bounds, { padding: { top: 60, left: 40, right: 40, bottom: 60 + (props.bottomInset ?? 0) }, maxZoom: 16, duration: 700 });
  }, [props.fitPoints, props.bottomInset, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const sel = props.locations.find((l) => l.id === props.selectedId);
    if (!map || !sel) return;
    const bounds = map.getBounds();
    if (bounds && !bounds.contains([sel.lng, sel.lat])) map.easeTo({ center: [sel.lng, sel.lat], duration: 500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.selectedId]);

  // --- user + destination markers ---------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    const gl = glRef.current;
    if (!map || !gl) return;
    userMarkerRef.current?.remove();
    userMarkerRef.current = null;
    if (props.userPosition) {
      const el = document.createElement("div");
      el.setAttribute("aria-label", "Your location");
      el.innerHTML =
        '<span class="relative flex size-4"><span class="absolute inset-0 animate-pulse-ring rounded-full bg-[#3b82f6]"></span><span class="relative size-4 rounded-full border-[3px] border-white bg-[#3b82f6] shadow"></span></span>';
      userMarkerRef.current = new gl.Marker({ element: el }).setLngLat([props.userPosition.lng, props.userPosition.lat]).addTo(map);
    }
  }, [props.userPosition, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const gl = glRef.current;
    if (!map || !gl) return;
    destMarkerRef.current?.remove();
    destMarkerRef.current = null;
    if (props.destination) {
      const el = document.createElement("div");
      el.setAttribute("aria-label", `Destination: ${props.destination.name ?? ""}`);
      el.innerHTML =
        '<svg width="34" height="44" viewBox="0 0 34 44"><path d="M17 0C7.6 0 0 7.4 0 16.6 0 29 17 44 17 44s17-15 17-27.4C34 7.4 26.4 0 17 0z" fill="#152a5c"/><circle cx="17" cy="16.5" r="7" fill="#5ee0d2"/></svg>';
      destMarkerRef.current = new gl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([props.destination.lng, props.destination.lat])
        .addTo(map);
    }
  }, [props.destination, ready]);

  // The map library's own CSS forces position:relative on its container, so
  // layout classes go on a wrapper and the map simply fills it.
  return (
    <div className={props.className}>
      <div ref={containerRef} className="h-full w-full" role="region" aria-label="Parking map" />
    </div>
  );
}

function toGeoJSON(locations: MapLocation[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: locations.map((l) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [l.lng, l.lat] },
      properties: {
        id: l.id,
        name: l.name,
        price: l.hourly_price,
        estimated: l.price_estimated,
        available: l.available_now,
        total: l.total_spots,
        mode: l.availability_mode,
      },
    })),
  };
}
