"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { updateFieldAction } from "./actions";
import { Input, Select } from "@/components/ui/input";
import { LTR_KINDS, MAX_OPTIONS, splitPasted, type CellValue } from "@/lib/lists/kinds";
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
  typeId: string;
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

function CellInner({ typeId, field, value, refs, label, failed, save, boxed, id }: CellProps) {
  const enqueue = useCellQueue(value ?? (field.multi ? [] : ""), save);
  const cls = cn(base, boxed && "rounded-md border", failed && "bg-destructive/10");

  if (field.kind === "select") {
    const picked = Array.isArray(value) ? value : value ? [value] : [];
    return (
      <ChoiceCell id={id} typeId={typeId} field={field} value={picked} label={label} className={cls} onChange={(v) => enqueue(field.multi ? v : (v[0] ?? ""))} />
    );
  }
  if (field.kind === "yes_no" || field.kind === "ref") {
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
        {missing && <option value={current}>{field.kind === "ref" ? "(נמחקה)" : current}</option>}
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

/**
 * A choice: a button showing what is picked, and a panel to pick – ticks when several are allowed, one otherwise.
 * The panel also edits the field's options in place: a new one is typed at the bottom (and picked here at once), and
 * an option can be taken off the list. Taking one off does not erase it from records that already chose it.
 */
function ChoiceCell({
  id,
  typeId,
  field,
  value,
  label,
  className,
  onChange,
}: {
  id?: string;
  typeId: string;
  field: SheetField;
  value: string[];
  label: string;
  className: string;
  onChange: (v: string[]) => void;
}) {
  // Where the panel opens: fixed to the screen under the button, so the table's scroll box cannot clip it.
  const [open, setOpen] = useState<{ top?: number; bottom?: number; right: number; max: number } | null>(null);
  const [picked, setPicked] = useState(value);
  // The field's options as the server last sent them, with this cell's own edits laid over until the refresh arrives.
  const [added, setAdded] = useState<string[]>([]);
  const [dropped, setDropped] = useState<string[]>([]);
  const options = [...field.options.filter((o) => !dropped.includes(o)), ...added.filter((o) => !field.options.includes(o) && !dropped.includes(o))];
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const place = () => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return null;
    // The panel is 16rem wide: kept inside the screen even under the last (leftmost) column.
    const right = Math.max(8, Math.min(window.innerWidth - r.right, window.innerWidth - 256 - 8));
    const below = window.innerHeight - r.bottom - 12;
    // Under the cell when there is room, otherwise above it – a fixed panel off the screen could never be reached.
    return below >= 280 || below >= r.top ? { top: r.bottom + 4, right, max: below } : { bottom: window.innerHeight - r.top + 4, right, max: r.top - 12 };
  };
  const isOpen = !!open;
  useEffect(() => {
    if (!isOpen) return;
    // A click or touch outside closes it; when the page scrolls, it follows its cell.
    const close = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) setOpen(null);
    };
    const follow = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) setOpen(place());
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", follow);
      window.removeEventListener("scroll", follow, true);
    };
  }, [isOpen]);

  const choose = (o: string) => {
    const next = field.multi ? (picked.includes(o) ? picked.filter((p) => p !== o) : [...options.filter((x) => x === o || picked.includes(x)), ...picked.filter((p) => !options.includes(p))]) : picked[0] === o ? [] : [o];
    setPicked(next);
    onChange(next);
    if (!field.multi) setOpen(null);
  };
  const saveOptions = async (next: string[]) => {
    setBusy(true);
    setError("");
    try {
      const r = await updateFieldAction(typeId, field.id, { options: next });
      if (!r.ok) {
        setError(r.error);
        return false;
      }
      setAdded(next.filter((o) => !field.options.includes(o)));
      setDropped(field.options.filter((o) => !next.includes(o)));
      return true;
    } catch {
      setError("לא נשמר – נסו שוב");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const addOption = async () => {
    const o = draft.replace(/\s+/g, " ").trim();
    if (!o) return;
    if (!options.includes(o) && !(await saveOptions([...options, o]))) return;
    setDraft("");
    if (!picked.includes(o)) choose(o);
  };
  // Taking an option off the list also drops it from this cell; other records keep it, marked as no longer listed.
  const removeOption = async (o: string) => {
    if ((await saveOptions(options.filter((x) => x !== o))) && picked.includes(o)) choose(o);
  };
  const strays = picked.filter((p) => !options.includes(p));

  return (
    <div ref={box}>
      <button
        ref={button}
        id={id}
        type="button"
        aria-label={label}
        aria-expanded={!!open}
        onClick={() => setOpen((v) => (v ? null : place()))}
        className={cn(className, "flex items-center justify-between gap-2 text-start text-sm")}
      >
        <span className="truncate">{picked.length ? picked.join(", ") : "—"}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {open && (
        <div
          role="group"
          aria-label={label}
          style={{ top: open.top, bottom: open.bottom, right: open.right, maxHeight: open.max }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(null);
          }}
          className="fixed z-50 flex w-64 flex-col rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {[...strays, ...options].map((o) => {
              const stray = !options.includes(o);
              return (
                <li key={o} className="flex items-center gap-1 rounded hover:bg-muted">
                  <label className="flex min-h-10 flex-1 cursor-pointer items-center gap-2 px-2">
                    <input type={field.multi ? "checkbox" : "radio"} name={`${id ?? label}-choice`} checked={picked.includes(o)} onChange={() => choose(o)} onClick={() => !field.multi && picked[0] === o && choose(o)} className="size-4" />
                    <span className="text-sm">{o}</span>
                    {stray && <span className="text-xs text-muted-foreground">(הוסרה מהרשימה)</span>}
                  </label>
                  {!stray && (
                    <button type="button" disabled={busy} aria-label={`הורדת האפשרות ${o} מהרשימה`} className="flex size-10 items-center justify-center rounded text-muted-foreground hover:text-destructive" onClick={() => removeOption(o)}>
                      <X className="size-4" aria-hidden />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <form
            className="mt-1 flex gap-1 border-t pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              void addOption();
            }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              // A column pasted from Excel adds every line as an option at once (none picked).
              onPaste={(e) => {
                const lines = splitPasted(e.clipboardData.getData("text"));
                if (lines.length < 2) return;
                e.preventDefault();
                const next = [...options, ...lines.filter((l) => !options.includes(l))];
                if (next.length > MAX_OPTIONS) return setError(`עד ${MAX_OPTIONS} אפשרויות בשדה (הודבקו ${next.length})`);
                void saveOptions(next);
              }}
              placeholder="אפשרות חדשה (או הדבקה מאקסל)" aria-label={`אפשרות חדשה ל${field.label}`} maxLength={120} className="h-10" />
            <button type="submit" disabled={busy || !draft.trim()} aria-label="הוספת האפשרות" className="flex size-10 shrink-0 items-center justify-center rounded bg-primary text-primary-foreground disabled:opacity-50">
              <Plus className="size-4" aria-hidden />
            </button>
          </form>
          {error && <p role="alert" className="px-2 py-1 text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
