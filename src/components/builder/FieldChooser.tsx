"use client";
import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FIELD_TYPE_META } from "@/lib/forms/field-types";
import type { FormField } from "@/lib/forms/schema";
import { cn } from "@/lib/utils";

export interface ChooserItem {
  field: FormField;
  /** Why this field cannot take the value, when it cannot (shown, greyed, not pickable). */
  blocked?: string;
  /** A fitting field whose kind differs – allowed, with a note that the value is checked when filled. */
  note?: string;
}

const fold = (s: string) => s.replace(/["'״׳`]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Pick a field of the form by typing: every field is listed, grouped by its type, the ones that fit first.
 * A field that cannot hold the value is shown greyed with the reason, so nothing seems to be missing.
 */
export function FieldChooser({ items, onPick, label, placeholder }: { items: ChooserItem[]; onPick: (fieldId: string) => void; label: string; placeholder: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const q = fold(query);
  const shown = items.filter((i) => !q || fold(`${i.field.label} ${i.field.id} ${FIELD_TYPE_META[i.field.type].label}`).includes(q));
  // Fitting fields first, then by type, each group keeping the form's order.
  const groups = new Map<string, ChooserItem[]>();
  for (const i of [...shown.filter((i) => !i.blocked), ...shown.filter((i) => i.blocked)]) {
    const g = `${i.blocked ? "1" : "0"}|${FIELD_TYPE_META[i.field.type].label}`;
    groups.set(g, [...(groups.get(g) ?? []), i]);
  }
  const flat = [...groups.values()].flat();
  const pickable = flat.filter((i) => !i.blocked);
  const pick = (i: ChooserItem) => {
    if (i.blocked) return;
    onPick(i.field.id);
    setQuery("");
    setOpen(false);
  };
  let n = -1;
  return (
    <div className="relative min-w-56 flex-1 sm:max-w-xs">
      <Input
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        className="h-9 pe-9 text-sm"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, pickable.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && open && pickable[active]) {
            e.preventDefault();
            pick(pickable[active]!);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      {open && (
        <ul id={listId} role="listbox" aria-label={label} className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-md border bg-popover py-1 text-popover-foreground shadow-lg">
          {[...groups.entries()].map(([g, list]) => (
            <li key={g} role="presentation">
              <div className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                {g.slice(2)}
                {g.startsWith("1") && " · לא מתאים"}
              </div>
              <ul role="group" aria-label={g.slice(2)}>
                {list.map((i) => {
                  const idx = i.blocked ? -1 : ++n;
                  return (
                    <li
                      key={i.field.id}
                      role="option"
                      aria-selected={false}
                      aria-disabled={!!i.blocked || undefined}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(i);
                      }}
                      onMouseEnter={() => idx >= 0 && setActive(idx)}
                      className={cn("flex min-h-10 items-center gap-2 px-3 text-sm", i.blocked ? "cursor-not-allowed text-muted-foreground/70" : "cursor-pointer", idx === active && !i.blocked && "bg-accent")}
                    >
                      <span className="min-w-0 flex-1 truncate">{i.field.label || i.field.id}</span>
                      {(i.blocked || i.note) && <span className="shrink-0 text-xs text-muted-foreground">{i.blocked ?? i.note}</span>}
                      <code dir="ltr" className="shrink-0 text-xs text-muted-foreground">{i.field.id}</code>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
          {shown.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">אין שדה כזה בטופס.</li>}
        </ul>
      )}
    </div>
  );
}
