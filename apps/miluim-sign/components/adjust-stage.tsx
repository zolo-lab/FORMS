"use client";

import { useState } from "react";
import type { Quad } from "@/lib/vision";

export function AdjustStage({
  src,
  width,
  height,
  corners,
  onChange,
}: {
  src: string;
  width: number;
  height: number;
  corners: Quad;
  onChange: (corners: Quad) => void;
}) {
  const [active, setActive] = useState<number | null>(null);
  const move = (index: number, event: React.PointerEvent) => {
    const rect = (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const x = Math.min(width - 1, Math.max(0, ((event.clientX - rect.left) / rect.width) * width));
    const y = Math.min(height - 1, Math.max(0, ((event.clientY - rect.top) / rect.height) * height));
    const next = corners.map((point, i) => i === index ? { x, y } : point) as Quad;
    onChange(next);
  };
  const points = corners.map((point) => `${(point.x / width) * 100},${(point.y / height) * 100}`).join(" ");
  return (
    <div dir="ltr" className="relative touch-none overflow-hidden rounded-lg border border-border bg-muted">
      <img src={src} alt="צילום לפני יישור" className="block h-auto w-full" draggable={false} />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <mask id="page-mask">
            <rect width="100" height="100" fill="white" />
            <polygon points={points} fill="black" />
          </mask>
        </defs>
        <rect width="100" height="100" fill="black" opacity="0.45" mask="url(#page-mask)" />
        <polygon points={points} fill="none" stroke="white" strokeWidth="0.6" />
      </svg>
      {corners.map((point, index) => (
        <button
          key={index}
          type="button"
          aria-label={`פינה ${index + 1}`}
          className="absolute z-10 size-11 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-primary bg-card"
          style={{ left: `${(point.x / width) * 100}%`, top: `${(point.y / height) * 100}%` }}
          onPointerDown={(event) => {
            setActive(index);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => { if (active === index) move(index, event); }}
          onPointerUp={() => setActive(null)}
        />
      ))}
    </div>
  );
}
