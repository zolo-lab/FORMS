"use client";
import { useId, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { branchesOf, branchLabel, searchBranches, type Branch } from "@/lib/forms/bank-branches";
import { cn } from "@/lib/utils";

const SHOWN = 60;

/**
 * The branch of the chosen bank, picked from the Bank of Israel list: type a number, a branch name or a city and
 * choose (ARIA combobox, keyboard and touch). Without a bank it waits for one; for a bank the list does not cover
 * it takes a plain branch number.
 */
export function BranchPicker({ id, bank, value, onChange, disabled, invalid, describedBy }: {
  id: string;
  bank: string;
  value: string;
  onChange: (branch: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const list = useMemo(() => (bank ? branchesOf(bank) : null), [bank]);
  const chosen = list?.find((b) => Number(b.code) === Number(value));
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  if (!bank) {
    return <Input id={id} disabled placeholder="בחרו בנק קודם" aria-describedby={describedBy} />;
  }
  if (!list) {
    return (
      <Input id={id} dir="ltr" className="text-start" inputMode="numeric" maxLength={3} value={value} disabled={disabled} aria-invalid={invalid}
        aria-describedby={describedBy} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} />
    );
  }

  const text = query ?? (chosen ? branchLabel(chosen) : value);
  const found = searchBranches(list, query ?? "");
  const shown = found.slice(0, SHOWN);
  const pick = (b: Branch) => {
    onChange(b.code);
    setQuery(null);
    setOpen(false);
  };
  const optionId = (i: number) => `${listId}-o${i}`;

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
        aria-describedby={describedBy}
        autoComplete="off"
        placeholder="מספר סניף, שם או עיר"
        disabled={disabled}
        value={text}
        onFocus={(e) => { setOpen(true); e.currentTarget.select(); }}
        onBlur={() => {
          // A typed branch number that is one of the bank's branches counts as chosen, without opening the list.
          const exact = query && /^\d+$/.test(query.trim()) ? list.find((b) => Number(b.code) === Number(query.trim())) : undefined;
          if (exact) onChange(exact.code);
          setOpen(false);
          setQuery(null);
        }}
        onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, shown.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && open && shown[active]) { e.preventDefault(); pick(shown[active]!); }
          else if (e.key === "Escape") { setOpen(false); setQuery(null); }
        }}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="סניפים"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border bg-card py-1 shadow-lg"
        >
          {shown.map((b, i) => (
            <li
              key={b.code}
              id={optionId(i)}
              role="option"
              aria-selected={chosen?.code === b.code}
              // Choose before the input loses focus (a click would blur first and close the list).
              onMouseDown={(e) => { e.preventDefault(); pick(b); }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm", i === active ? "bg-accent" : "", chosen?.code === b.code ? "font-semibold" : "")}
            >
              <span dir="ltr" className="w-10 shrink-0 text-end tabular-nums text-muted-foreground">{b.code}</span>
              <span className="min-w-0 flex-1 truncate">{b.name}{b.city && b.city !== b.name ? <span className="text-muted-foreground"> · {b.city}</span> : null}</span>
            </li>
          ))}
          {found.length === 0 && (
            <li role="option" aria-selected={false} aria-disabled className="px-3 py-2 text-sm text-muted-foreground">
              לא נמצא סניף כזה בבנק הזה. נסו מספר אחר, או חפשו לפי שם העיר.
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
