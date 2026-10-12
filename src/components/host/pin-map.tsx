"use client";

import type mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { loadMapEngine, MAP_STYLES } from "@/lib/map-engine";

/** Small map with a draggable pin to fine-tune a listing's exact entrance. */
export default function PinMap({ lat, lng, onChange, className }: { lat: number; lng: number; onChange: (p: { lat: number; lng: number }) => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const start = useRef({ lat, lng });
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });

  useEffect(() => {
    let cancelled = false;
    loadMapEngine().then((gl) => {
      if (cancelled || !ref.current) return;
      const { lat: la, lng: ln } = start.current;
      const map = new gl.Map({ container: ref.current, style: MAP_STYLES.streets, center: [ln, la], zoom: 17 });
      map.addControl(new gl.NavigationControl({ showCompass: false }), "top-right");
      const marker = new gl.Marker({ draggable: true, color: "#152a5c" }).setLngLat([ln, la]).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLngLat();
        cb.current({ lat: p.lat, lng: p.lng });
      });
      map.on("click", (e) => {
        marker.setLngLat(e.lngLat);
        cb.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      });
      mapRef.current = map;
      markerRef.current = marker;
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cur = markerRef.current?.getLngLat();
    if (!cur || (Math.abs(cur.lat - lat) < 1e-7 && Math.abs(cur.lng - lng) < 1e-7)) return;
    markerRef.current?.setLngLat([lng, lat]);
    mapRef.current?.easeTo({ center: [lng, lat], zoom: 17 });
  }, [lat, lng]);

  return (
    <div className={className}>
      <div ref={ref} className="h-full w-full" role="application" aria-label="Drag the pin to your parking entrance" />
    </div>
  );
}
