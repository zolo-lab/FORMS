"use client";
import { useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

export type FillView = "document" | "form";

const DESKTOP_QUERY = "(min-width: 1024px)";
function subscribe(cb: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/**
 * Which view a fill screen opens in: on a computer the document (when the form can be filled on it), on a phone the
 * responsive form. The person can switch at any time; their choice then stays.
 */
export function useFillView(canDocument: boolean): [FillView, (v: FillView) => void] {
  const desktop = useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP_QUERY).matches, () => false);
  const [chosen, setChosen] = useState<FillView | null>(null);
  const view: FillView = canDocument ? (chosen ?? (desktop ? "document" : "form")) : "form";
  return [view, setChosen];
}

/** A small switch at the top-left corner: 📄 shows the document, 📱 the responsive form. */
export function ViewToggle({ view, onChange, className }: { view: FillView; onChange: (v: FillView) => void; className?: string }) {
  const next: FillView = view === "document" ? "form" : "document";
  const label = next === "form" ? "מעבר לתצוגת טופס (נוח בנייד)" : "מעבר לתצוגת המסמך";
  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      aria-label={label}
      title={label}
      className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-md border bg-card text-xl leading-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring", className)}
    >
      <span aria-hidden>{next === "form" ? "📱" : "📄"}</span>
    </button>
  );
}
