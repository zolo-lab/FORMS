"use client";
import { useId, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { RecordOption } from "@/lib/forms/linked";
import { cn } from "@/lib/utils";

const SHOWN = 50;

/** Search the way people type: no quotes, one space, case folded; every word must appear somewhere. */
const fold = (s: string) => s.replace(/["'״׳`]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
function matches(o: RecordOption, q: string): boolean {
  const hay = fold([o.label, ...Object.values(o.data ?? {}).flat()].join(" "));
  return fold(q).split(" ").every((w) => hay.includes(w));
}

/**
 * A record of a list, picked by typing and choosing (ARIA combobox). A list of one record is already picked
 * (see `withListPicks`), so the picker just shows it. Searching looks at the record's title and the values the form
 * links to, so "גדע 052" finds the supplier by name or phone.
 */
export function RecordPicker({ id, options, value, onChange, disabled, invalid, placeholder }: {
  id: string;
  options: RecordOption[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
}) {
  const chosen = options.find((o) => o.value === value);
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const text = query ?? chosen?.label ?? "";
  const found = query ? options.filter((o) => matches(o, query)) : options;
  const shown = found.slice(0, SHOWN);
  const pick = (o: RecordOption) => {
    onChange(o.value);
    setQuery(null);
    setOpen(false);
  };
  const optionId = (i: number) => `${listId}-o${i}`;

  if (options.length === 0) return <Input id={id} disabled placeholder="אין עדיין רשומות ברשימה" aria-invalid={invalid} />;

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[active] ? optionId(active) : undefined}
        aria-invalid={invalid}
        autoComplete="off"
        placeholder={placeholder ?? (options.length > 8 ? "הקלידו לחיפוש או בחרו…" : "בחרו…")}
        disabled={disabled}
        value={text}
        className="pe-10"
        onFocus={(e) => {
          setOpen(true);
          e.currentTarget.select();
        }}
        onBlur={() => {
          // One exact match for what was typed counts as chosen.
          const exact = query ? options.filter((o) => fold(o.label) === fold(query)) : [];
          if (exact.length === 1) onChange(exact[0]!.value);
          setOpen(false);
          setQuery(null);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, shown.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && open && shown[active]) {
            e.preventDefault();
            pick(shown[active]!);
          } else if (e.key === "Escape") {
            setOpen(false);
            setQuery(null);
          }
        }}
      />
      <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      {open && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border bg-card py-1 shadow-lg">
          {shown.map((o, i) => (
            <li
              key={o.value}
              id={optionId(i)}
              role="option"
              aria-selected={o.value === value}
              // Choose before the input loses focus (a click would blur first and close the list).
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm", i === active && "bg-accent", o.value === value && "font-semibold")}
            >
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.value === value && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
            </li>
          ))}
          {found.length === 0 && (
            <li role="option" aria-selected={false} aria-disabled className="px-3 py-2 text-sm text-muted-foreground">
              לא נמצא. נסו חלק מהשם.
            </li>
          )}
          {found.length > SHOWN && (
            <li role="option" aria-selected={false} aria-disabled className="px-3 py-2 text-xs text-muted-foreground">
              מוצגים {SHOWN} מתוך {found.length}. המשיכו להקליד כדי לצמצם.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
