"use client";

import { animate, motion, useMotionValue, useReducedMotion, type PanInfo } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type SnapPoint = "peek" | "half" | "full";

/**
 * Draggable, non-modal bottom sheet over the map (mobile). Snaps to
 * peek / half / full; the handle is a button so keyboard and screen-reader
 * users can expand it too.
 */
export function BottomSheet({
  children,
  header,
  snap,
  onSnapChange,
  peekHeight = 148,
  className,
}: {
  children: React.ReactNode;
  header?: React.ReactNode;
  snap: SnapPoint;
  onSnapChange: (s: SnapPoint) => void;
  peekHeight?: number;
  className?: string;
}) {
  const [vh, setVh] = useState(0);
  const y = useMotionValue(0);
  const reduced = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => setVh(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Sheet height = full; translateY reveals the chosen amount.
  const sheetHeight = Math.round(vh * 0.88);
  const offsets = useCallback(
    () => ({
      full: 0,
      half: Math.max(0, sheetHeight - Math.round(vh * 0.5)),
      peek: Math.max(0, sheetHeight - peekHeight - 64), // 64 = bottom nav
    }),
    [sheetHeight, vh, peekHeight],
  );

  useEffect(() => {
    if (!vh) return;
    const target = offsets()[snap];
    if (reduced) y.set(target);
    else animate(y, target, { type: "spring", stiffness: 420, damping: 42 });
  }, [snap, vh, offsets, y, reduced]);

  function onDragEnd(_: unknown, info: PanInfo) {
    const o = offsets();
    const projected = y.get() + info.velocity.y * 0.2;
    const entries = Object.entries(o) as [SnapPoint, number][];
    const nearest = entries.reduce((best, cur) => (Math.abs(cur[1] - projected) < Math.abs(best[1] - projected) ? cur : best));
    onSnapChange(nearest[0]);
    animate(y, nearest[1], { type: "spring", stiffness: 420, damping: 42 });
  }

  const nextSnap: Record<SnapPoint, SnapPoint> = { peek: "half", half: "full", full: "peek" };

  return (
    <motion.section
      aria-label="Results"
      style={{ y, height: sheetHeight || "88dvh" }}
      drag="y"
      dragConstraints={{ top: 0, bottom: offsets().peek }}
      dragElastic={0.06}
      dragMomentum={false}
      onDragEnd={onDragEnd}
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-3xl border-t bg-background shadow-[0_-12px_40px_-12px_rgb(0_0_0/0.25)] md:hidden",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onSnapChange(nextSnap[snap])}
        aria-label={snap === "full" ? "Collapse results" : "Expand results"}
        aria-expanded={snap !== "peek"}
        className="flex h-7 w-full shrink-0 cursor-grab items-center justify-center active:cursor-grabbing"
      >
        <span className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
      </button>
      {header && <div className="shrink-0 px-4 pb-2">{header}</div>}
      <div
        ref={scrollRef}
        // Let the list scroll when expanded; dragging it collapses the sheet only from the top.
        onPointerDownCapture={(e) => {
          if (snap === "full" && scrollRef.current && scrollRef.current.scrollTop > 0) e.stopPropagation();
        }}
        className={cn("min-h-0 flex-1 overscroll-contain px-4 pb-24", snap === "peek" ? "overflow-hidden" : "overflow-y-auto")}
      >
        {children}
      </div>
    </motion.section>
  );
}
