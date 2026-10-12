"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef } from "react";
import { publicEnv } from "@/lib/env";

/** Small map with a draggable pin to fine-tune a listing's exact entrance. */
export default function PinMap({ lat, lng, onChange, className }: { lat: number; lng: number; onChange: (p: { lat: number; lng: number }) => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });

  useEffect(() => {
    if (!ref.current || !publicEnv.mapboxToken) return;
    mapboxgl.accessToken = publicEnv.mapboxToken;
    const map = new mapboxgl.Map({ container: ref.current, style: "mapbox://styles/mapbox/streets-v12", center: [lng, lat], zoom: 17 });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    const marker = new mapboxgl.Marker({ draggable: true, color: "#152a5c" }).setLngLat([lng, lat]).addTo(map);
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
    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cur = markerRef.current?.getLngLat();
    if (!cur || (Math.abs(cur.lat - lat) < 1e-7 && Math.abs(cur.lng - lng) < 1e-7)) return;
    markerRef.current?.setLngLat([lng, lat]);
    mapRef.current?.easeTo({ center: [lng, lat], zoom: 17 });
  }, [lat, lng]);

  if (!publicEnv.mapboxToken) {
    return <div className={`flex items-center justify-center bg-muted text-sm text-muted-foreground ${className ?? ""}`}>Map preview needs NEXT_PUBLIC_MAPBOX_TOKEN</div>;
  }
  return <div ref={ref} className={className} role="application" aria-label="Drag the pin to your parking entrance" />;
}
