"use client";

import { useCallback, useEffect, useState } from "react";

export interface Position {
  lat: number;
  lng: number;
  accuracy?: number;
}

type Status = "idle" | "locating" | "ready" | "denied" | "unavailable";

const KEY = "parksmart:last-position";

function readCached(): Position | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Position) : null;
  } catch {
    return null;
  }
}

/** Browser geolocation with a session cache so pages don't re-prompt. */
export function useGeolocation({ auto = false }: { auto?: boolean } = {}) {
  const [position, setPosition] = useState<Position | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  const request = useCallback(() => {
    return new Promise<Position | null>((resolve) => {
      if (!("geolocation" in navigator)) {
        setStatus("unavailable");
        resolve(null);
        return;
      }
      setStatus("locating");
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const pos = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
          setPosition(pos);
          setStatus("ready");
          try {
            sessionStorage.setItem(KEY, JSON.stringify(pos));
          } catch {
            /* storage unavailable */
          }
          resolve(pos);
        },
        (err) => {
          setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
      );
    });
  }, []);

  useEffect(() => {
    // Read the cache after mount (not in the initial state) so server and client HTML match.
    const cached = readCached();
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from browser storage after hydration
      setPosition(cached);
      setStatus("ready");
      return;
    }
    if (auto) void request();
  }, [auto, request]);

  return { position, status, request };
}
