"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { LTR_KINDS, type CellValue } from "@/lib/lists/kinds";
import type { SheetField } from "@/server/lists-store";
import { cn } from "@/lib/utils";

/** Saves one cell; resolves to whether it took. */
export type SaveFn = (value: CellValue) => Promise<boolean>;

const inputMode = (k: SheetField["kind"]): React.HTMLAttributes<HTMLInputElement>["inputMode"] =>
  k === "phone" ? "tel" : k === "email" ? "email" : k === "number" || k === "currency" || k === "percent" || k === "id_number" ? "numeric" : undefined;

/**
 * The per-cell queue: each save waits for the previous one of the same cell, so two quick edits can never land in
 * the wrong order. `last` is the value the server is known to hold – it moves only when a save succeeds, so a failed
 * value is sent again the next time the cell is left.
 */
function useCellQueue(initial: CellValue, save: SaveFn) {
  const last = useRef<string>(JSON.stringify(initial));
  const chain = useRef<Promise<void>>(Promise.resolve());
  const inFlight = useRef<string | null>(null);
  return (value: CellValue) => {
    const v = JSON.stringify(typeof value === "string" ? value.trim() : value);
    if (v === last.current || v === inFlight.current) return;
    inFlight.current = v;
    chain.current = chain.current.then(async () => {
      let ok = false;
      try {
        ok = await save(value);
      } catch {
        ok = false;
      } finally {
        if (inFlight.current === v) inFlight.current = null;
      }
      if (ok) last.current = v;
    });
  };
}

const base = "h-10 w-full min-w-36 rounded-none border-0 bg-transparent px-3 shadow-none focus-visible:bg-background focus-visible:ring-2";

interface CellProps {
  field: SheetField;
  value: CellValue | undefined;
  refs?: { id: string; title: string }[];
  label: string;
  failed: boolean;
  save: SaveFn;
  /** On phones the cell sits in a card: give it a border of its own. */
  boxed?: boolean;
  id?: string;
}

/** One cell, whatever the kind of its field. A fresh value from the server remounts it (no syncing in effects). */
export function Cell(props: CellProps) {
  return <CellInner key={JSON.stringify(props.value ?? "")} {...props} />;
}

function CellInner({ field, value, refs, label, failed, save, boxed, id }: CellProps) {
  const enqueue = useCellQueue(value ?? (field.multi ? [] : ""), save);
  const cls = cn(base, boxed && "rounded-md border", failed && "bg-destructive/10");

  if (field.kind === "select" && field.multi) {
    return <MultiCell id={id} options={field.options} value={Array.isArray(value) ? value : value ? [value] : []} label={label} className={cls} onChange={enqueue} />;
  }
  if (field.kind === "select" || field.kind === "yes_no" || field.kind === "ref") {
    const current = typeof value === "string" ? value : "";
    const options =
      field.kind === "yes_no"
        ? [
            { v: "yes", t: "כן" },
            { v: "no", t: "לא" },
          ]
        : field.kind === "ref"
          ? (refs ?? []).map((r) => ({ v: r.id, t: r.title }))
          : field.options.map((o) => ({ v: o, t: o }));
    const missing = current && !options.some((o) => o.v === current);
    return (
      <Select id={id} defaultValue={current} aria-label={label} aria-invalid={failed || undefined} className={cls} onChange={(e) => enqueue(e.target.value)}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.v} value={o.v}>{o.t}</option>
        ))}
        {missing && <option value={current}>{field.kind === "ref" ? "(נמחקה)" : `${current} (לא ברשימה)`}</option>}
      </Select>
    );
  }
  return <TextCell id={id} field={field} value={typeof value === "string" ? value : ""} label={label} failed={failed} className={cls} onCommit={enqueue} />;
}

function TextCell({ id, field, value, label, failed, className, onCommit }: { id?: string; field: SheetField; value: string; label: string; failed: boolean; className: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  // Escape blurs the cell; the blur must not save the edit Escape just threw away.
  const cancelled = useRef(false);
  const ltr = LTR_KINDS.has(field.kind);
  return (
    <Input
      id={id}
      type={field.kind === "date" ? "date" : "text"}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (cancelled.current) cancelled.current = false;
        else onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(draft);
          // The cell below, same column – as in a spreadsheet.
          const cells = Array.from(document.querySelectorAll<HTMLInputElement>(`[data-col="${field.key}"]`)).filter((el) => el.offsetParent !== null);
          cells[cells.indexOf(e.currentTarget) + 1]?.focus();
        }
        if (e.key === "Escape") {
          cancelled.current = true;
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
      data-col={field.key}
      aria-label={label}
      aria-invalid={failed || undefined}
      dir={ltr ? "ltr" : undefined}
      inputMode={inputMode(field.kind)}
      maxLength={500}
      // A left-to-right value still sits on the right of a Hebrew table.
      className={cn(className, ltr && "text-end")}
    />
  );
}

/** Several choices: a button showing what is picked; a panel of checkboxes, each tick saved at once. */
function MultiCell({ id, options, value, label, className, onChange }: { id?: string; options: string[]; value: string[]; label: string; className: string; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(value);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const toggle = (o: string) => {
    const next = picked.includes(o) ? picked.filter((p) => p !== o) : options.filter((x) => x === o || picked.includes(x));
    setPicked(next);
    onChange(next);
  };
  return (
    <div ref={box} className="relative">
      <button id={id} type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen((v) => !v)} className={cn(className, "flex items-center justify-between gap-2 text-start text-sm")}>
        <span className="truncate">{picked.length ? picked.join(", ") : "—"}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {open && (
        <div role="group" aria-label={label} className="absolute start-0 top-full z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {options.map((o) => (
            <label key={o} className="flex min-h-10 cursor-pointer items-center gap-2 rounded px-2 hover:bg-muted">
              <input type="checkbox" checked={picked.includes(o)} onChange={() => toggle(o)} className="size-4" />
              <span className="text-sm">{o}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
