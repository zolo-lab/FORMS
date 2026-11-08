"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, Link2, Loader2, MoreHorizontal, Plus, TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DICTIONARY_TYPE_LABELS, ORG_FIELD_TYPES } from "@/lib/fields/types";
import { cn } from "@/lib/utils";
import { addColumnAction, columnUsageAction, deleteColumnAction, saveCellAction, updateColumnAction } from "./actions";

export interface SheetColumn {
  id: string;
  key: string;
  label: string;
  type: string;
  /** At least one form points at this column: shown as a small link mark, and spelled out before a deletion. */
  inForms: boolean;
}
export interface SheetRow {
  id: string;
  name: string;
  registrationNumber: string;
  values: Record<string, string>;
}

type SaveState = "idle" | "saving" | "saved" | "error";

/** Types whose value reads left to right even inside a Hebrew table: numbers, ids, phones, mail. */
const LTR_TYPES = new Set(["number", "currency", "percent", "id_number", "phone", "email", "date"]);
const inputMode = (type: string): React.HTMLAttributes<HTMLInputElement>["inputMode"] =>
  type === "phone" ? "tel" : type === "email" ? "email" : type === "number" || type === "currency" || type === "percent" || type === "id_number" ? "numeric" : undefined;

/**
 * The organizations as a sheet: a row per organization, a column per field the admin added. Each cell saves itself
 * the moment it is left; the chip at the top says so. Nothing on it is in English – the internal name lives behind
 * "פרטים למפתחים" in the column menu.
 */
export function OrgSheet({ columns, rows }: { columns: SheetColumn[]; rows: SheetRow[] }) {
  const router = useRouter();
  const [state, setState] = useState<SaveState>("idle");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  // The same set as a ref: `end` runs inside async code where the state above would be stale.
  const failedRef = useRef<Set<string>>(new Set());
  const pending = useRef(0);

  const begin = () => {
    pending.current++;
    setState("saving");
    setMessage(null);
  };
  const end = (ok: boolean, error?: string) => {
    pending.current = Math.max(0, pending.current - 1);
    if (!ok) {
      setState("error");
      setMessage(error ?? "לא נשמר");
      return;
    }
    // "Everything saved" is only true when no cell is still sitting on a failure.
    if (pending.current === 0) {
      if (failedRef.current.size === 0) {
        setState("saved");
        setLastSaved(new Date());
      } else {
        setState("error");
        setMessage("יש תא שלא נשמר");
      }
    }
  };

  /** Saves one cell; resolves to whether it took, so the cell knows what its last saved value really is. */
  const saveCell = async (orgId: string, key: string, value: string, before: string): Promise<boolean> => {
    if (value.trim() === before.trim()) return true;
    const cell = `${orgId}:${key}`;
    begin();
    // A thrown error (network, a lost session) is a failed save like any other, never a chip stuck on "שומר…".
    const r = await saveCellAction(orgId, key, value).catch((): { ok: false; error: string } => ({ ok: false, error: "אין חיבור לשרת" }));
    const next = new Set(failedRef.current);
    if (r.ok) next.delete(cell);
    else next.add(cell);
    failedRef.current = next;
    setFailed(next);
    end(r.ok, r.ok ? undefined : r.error);
    if (r.ok) router.refresh();
    return r.ok;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          שורה לכל עמותה, עמודה לכל פרט שרוצים שיתמלא לבד בטפסים. כותבים בתא – וזה נשמר.
        </p>
        <SaveChip state={state} at={lastSaved} message={message} />
      </div>

      {/* Desktop: the sheet. */}
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="sticky start-0 z-10 bg-muted/50 px-3 py-2 text-start font-medium">שם העמותה</th>
              <th scope="col" className="px-3 py-2 text-start font-medium">ח&quot;פ</th>
              {columns.map((c) => (
                <ColumnHeader key={c.id} column={c} onChanged={() => router.refresh()} />
              ))}
              <th scope="col" className="px-2 py-1 text-start font-normal">
                <AddColumn first={columns.length === 0} onAdded={() => router.refresh()} />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <th scope="row" className="sticky start-0 z-10 bg-background px-3 py-1.5 text-start font-medium">
                  <Link href={`/admin/settings/organizations?edit=${r.id}`} className="hover:underline">{r.name}</Link>
                </th>
                <td className="px-3 py-1.5 font-mono text-xs" dir="ltr">{r.registrationNumber}</td>
                {columns.map((c) => (
                  <td key={c.id} className="p-0">
                    <Cell
                      column={c}
                      value={r.values[c.key] ?? ""}
                      failed={failed.has(`${r.id}:${c.key}`)}
                      label={`${c.label} – ${r.name}`}
                      onSave={(v, before) => saveCell(r.id, c.key, v, before)}
                    />
                  </td>
                ))}
                <td />
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t px-3 py-2">
          <Link href="/admin/settings/organizations?new=1" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <Plus className="size-4" aria-hidden /> עמותה חדשה
          </Link>
        </div>
      </div>

      {/* Phone: one card per organization; the same cells, stacked. */}
      <div className="space-y-3 md:hidden">
        {columns.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="עמודות">
            {columns.map((c) => <ColumnHeader key={c.id} column={c} onChanged={() => router.refresh()} as="div" />)}
          </div>
        )}
        <AddColumn first={columns.length === 0} onAdded={() => router.refresh()} block />
        {rows.map((r) => (
          <section key={r.id} aria-labelledby={`org-${r.id}`} className="rounded-lg border p-3">
            <h3 id={`org-${r.id}`} className="mb-2 font-semibold">
              <Link href={`/admin/settings/organizations?edit=${r.id}`} className="hover:underline">{r.name}</Link>
              <span className="ms-2 font-mono text-xs font-normal text-muted-foreground" dir="ltr">{r.registrationNumber}</span>
            </h3>
            {columns.length === 0 && <p className="text-sm text-muted-foreground">עוד אין עמודות. הוסיפו אחת למעלה.</p>}
            <div className="space-y-2">
              {columns.map((c) => (
                <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-2">
                  <Label htmlFor={`m-${r.id}-${c.key}`} className="truncate text-sm">{c.label}</Label>
                  <Cell
                    id={`m-${r.id}-${c.key}`}
                    column={c}
                    value={r.values[c.key] ?? ""}
                    failed={failed.has(`${r.id}:${c.key}`)}
                    label={`${c.label} – ${r.name}`}
                    onSave={(v, before) => saveCell(r.id, c.key, v, before)}
                    bordered
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** "שומר…" → "כל השינויים נשמרו ✓ 20:57", or the reason a cell did not save. Always visible, never a toast. */
function SaveChip({ state, at, message }: { state: SaveState; at: Date | null; message: string | null }) {
  const time = at ? at.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <p role="status" aria-live="polite" className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs", state === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "text-muted-foreground")}>
      {state === "saving" && <><Loader2 className="size-3.5 animate-spin" aria-hidden /> שומר…</>}
      {state === "saved" && <><Check className="size-3.5 text-success" aria-hidden /> כל השינויים נשמרו · {time}</>}
      {state === "error" && <><TriangleAlert className="size-3.5" aria-hidden /> {message ?? "לא נשמר"} – נסו שוב</>}
      {state === "idle" && <>השינויים נשמרים אוטומטית</>}
    </p>
  );
}

/** One editable cell. Saves on blur and on Enter; Enter also moves to the cell below, as in a spreadsheet. */
function Cell(props: { id?: string; column: SheetColumn; value: string; failed: boolean; label: string; onSave: (value: string, before: string) => Promise<boolean>; bordered?: boolean }) {
  // A fresh value from the server (another admin, a rename) remounts the cell rather than syncing state in an effect.
  return <CellInner key={props.value} {...props} />;
}

function CellInner({ id, column, value, failed, label, onSave, bordered }: { id?: string; column: SheetColumn; value: string; failed: boolean; label: string; onSave: (value: string, before: string) => Promise<boolean>; bordered?: boolean }) {
  const [draft, setDraft] = useState(value);
  /** The last value the server is known to hold; it moves only when a save succeeds, so a failed one is retried. */
  const before = useRef(value);
  /** The value a save is in flight for: Enter followed by blur must not send it twice. */
  const saving = useRef<string | null>(null);
  /** The previous save of THIS cell: the next one waits for it, so two edits can never race and land out of order. */
  const chain = useRef<Promise<void>>(Promise.resolve());
  const commit = () => {
    if (draft.trim() === before.current.trim() || saving.current === draft) return;
    const value = draft;
    saving.current = value;
    chain.current = chain.current.then(async () => {
      let ok = false;
      try {
        ok = await onSave(value, before.current);
      } finally {
        if (saving.current === value) saving.current = null;
      }
      if (ok) before.current = value;
    });
  };
  return (
    <Input
      id={id}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          // Next row, same column.
          const cells = Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-col="${column.key}"]`));
          const i = cells.indexOf(e.currentTarget);
          cells[i + 1]?.focus();
        }
        if (e.key === "Escape") {
          setDraft(before.current);
          e.currentTarget.blur();
        }
      }}
      data-col={column.key}
      aria-label={label}
      aria-invalid={failed || undefined}
      dir={LTR_TYPES.has(column.type) ? "ltr" : undefined}
      inputMode={inputMode(column.type)}
      maxLength={200}
      className={cn(
        "h-10 min-w-36 rounded-none border-0 bg-transparent px-3 shadow-none focus-visible:bg-background focus-visible:ring-2",
        bordered && "rounded-md border",
        failed && "bg-destructive/10",
      )}
    />
  );
}

/**
 * A column header with its menu: rename in place, change the type, see the internal name, delete with the real
 * impact in front of the admin.
 */
function ColumnHeader({ column, onChanged, as: Tag = "th" }: { column: SheetColumn; onChanged: () => void; as?: "th" | "div" }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirm, setConfirm] = useState<null | { filled: number; forms: { id: string; title: string }[] }>(null);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const rename = (label: string) => {
    setRenaming(false);
    if (!label.trim() || label.trim() === column.label) return;
    start(async () => {
      const r = await updateColumnAction(column.id, { label });
      if (!r.ok) setError(r.error);
      else onChanged();
    });
  };
  const retype = (type: string) =>
    start(async () => {
      const r = await updateColumnAction(column.id, { type });
      if (!r.ok) setError(r.error);
      else onChanged();
    });
  const askDelete = () =>
    start(async () => {
      setOpen(false);
      setConfirm(await columnUsageAction(column.key));
    });
  const doDelete = () =>
    start(async () => {
      const r = await deleteColumnAction(column.id);
      setConfirm(null);
      if (!r.ok) setError(r.error);
      else onChanged();
    });

  return (
    <Tag scope={Tag === "th" ? "col" : undefined} className={cn("min-w-36 px-1 py-1 text-start font-medium", Tag === "div" && "rounded-md border bg-muted/30 text-sm")}>
      <div ref={ref} className="relative flex items-center gap-1">
        {renaming ? (
          <Input
            autoFocus
            defaultValue={column.label}
            aria-label="שם העמודה"
            maxLength={80}
            className="h-8"
            onBlur={(e) => rename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") rename(e.currentTarget.value);
              if (e.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
          <button type="button" onDoubleClick={() => setRenaming(true)} className="min-h-8 truncate px-2 text-start" title="לחיצה כפולה לשינוי השם">
            {column.label}
          </button>
        )}
        {column.inForms && <Link2 className="size-3.5 shrink-0 text-primary" aria-label="משמשת בטפסים" />}
        <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={`פעולות – ${column.label}`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MoreHorizontal className="size-4" aria-hidden />}
        </Button>
        {open && (
          <div role="menu" className="absolute end-0 top-full z-20 mt-1 w-64 space-y-1 rounded-md border bg-popover p-2 text-sm font-normal text-popover-foreground shadow-md">
            <button role="menuitem" type="button" className="block w-full rounded px-2 py-2 text-start hover:bg-muted" onClick={() => { setOpen(false); setRenaming(true); }}>
              שינוי שם
            </button>
            <label className="block px-2 py-1">
              <span className="mb-1 block text-xs text-muted-foreground">סוג</span>
              <Select value={column.type} onChange={(e) => retype(e.target.value)} className="h-9" aria-label={`סוג – ${column.label}`}>
                {ORG_FIELD_TYPES.map((t) => <option key={t} value={t}>{DICTIONARY_TYPE_LABELS[t]}</option>)}
              </Select>
            </label>
            <details className="px-2 py-1">
              <summary className="cursor-pointer text-xs text-muted-foreground">פרטים למפתחים</summary>
              <p className="mt-1 text-xs text-muted-foreground">
                שם פנימי: <bdi dir="ltr" className="select-all font-mono text-foreground">{column.key}</bdi>
              </p>
            </details>
            <button role="menuitem" type="button" className="block w-full rounded px-2 py-2 text-start text-destructive hover:bg-destructive/10" onClick={askDelete}>
              מחיקת העמודה…
            </button>
          </div>
        )}
      </div>
      {error && <p role="alert" className="px-2 text-xs font-normal text-destructive">{error}</p>}

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} title={`מחיקת העמודה "${column.label}"`}>
        {confirm && (
          <div className="space-y-4 text-sm">
            <p>
              {confirm.filled > 0 ? `העמודה מלאה ב-${confirm.filled} עמותות.` : "אף עמותה עוד לא מילאה אותה."}{" "}
              {confirm.forms.length > 0
                ? `היא משמשת ב-${confirm.forms.length} טפסים – מחיקה תרוקן את השדות האלה בטפסים:`
                : "אף טופס לא משתמש בה."}
            </p>
            {confirm.forms.length > 0 && (
              <ul className="list-inside list-disc">
                {confirm.forms.map((f) => (
                  <li key={f.id}><Link href={`/admin/forms/${f.id}`} className="underline">{f.title}</Link></li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirm(null)}>ביטול</Button>
              {confirm.forms.length > 0 ? (
                <>
                  <Link href={`/admin/forms/${confirm.forms[0]!.id}`} className={buttonVariants()}>הצגת הטפסים</Link>
                  <Button variant="destructive" onClick={doDelete} disabled={busy}>מחיקה בכל זאת</Button>
                </>
              ) : (
                <Button variant="destructive" onClick={doDelete} disabled={busy}>מחיקה מכל העמותות</Button>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </Tag>
  );
}

/** "+ עמודה": a Hebrew name and a type. Two questions, Enter, done. The first one doubles as the empty state. */
function AddColumn({ first, onAdded, block }: { first: boolean; onAdded: () => void; block?: boolean }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<string>("short_text");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const types = useMemo(() => ORG_FIELD_TYPES.map((t) => ({ id: t, label: DICTIONARY_TYPE_LABELS[t] })), []);

  const submit = () =>
    start(async () => {
      const r = await addColumnAction(label, type);
      if (!r.ok) return setError(r.error);
      setLabel("");
      setType("short_text");
      setError(null);
      setOpen(false);
      onAdded();
    });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex min-h-10 items-center gap-1 rounded-md border border-dashed px-3 text-sm text-muted-foreground hover:border-primary hover:text-primary",
          block && "w-full justify-center",
          first && "border-primary/60 text-primary",
        )}
      >
        <Plus className="size-4" aria-hidden /> עמודה
        {first && <span className="font-normal"> · למשל: תיק ניכויים</span>}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="עמודה חדשה לכל העמותות">
        <form
          className="space-y-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="col-label">שם העמודה</Label>
            <Input id="col-label" autoFocus value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="למשל: תיק ניכויים" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="col-type">סוג</Label>
            <Select id="col-type" value={type} onChange={(e) => setType(e.target.value)}>
              {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          </div>
          {error && <p role="alert" className="text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">העמודה תופיע בכל העמותות והעסקים, ולכל אחד יהיה הערך שלו. בבונה הטפסים בוחרים אותה תחת &quot;מילוי אוטומטי&quot;.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>ביטול</Button>
            <Button type="submit" disabled={busy || !label.trim()}>{busy ? "מוסיף…" : "הוספה"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
