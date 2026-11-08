"use client";

import { LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewMode = "table" | "cards";

/** "טבלה / כרטיסים": how a list is shown. */
export function ViewToggle({ value, onChange, label = "תצוגה" }: { value: ViewMode; onChange: (v: ViewMode) => void; label?: string }) {
  const items = [
    { key: "table" as const, text: "טבלה", Icon: List },
    { key: "cards" as const, text: "כרטיסים", Icon: LayoutGrid },
  ];
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border p-0.5">
      {items.map(({ key, text, Icon }) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cn("inline-flex min-h-9 items-center gap-1.5 rounded px-3 text-sm", value === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
        >
          <Icon className="size-4" aria-hidden /> {text}
        </button>
      ))}
    </div>
  );
}
