"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { STAGE_H, STAGE_W } from "./AtmStage.tsx";

/** Fits the fixed 540×960 stage into its parent (letterboxed, centered). One state update per resize. */
export function StageScaler({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setScale(Math.min(r.width / STAGE_W, r.height / STAGE_H));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute", left: "50%", top: "50%", width: STAGE_W, height: STAGE_H,
          transform: `translate(-50%, -50%) scale(${scale || 1})`, visibility: scale ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}
