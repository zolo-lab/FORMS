"use client";
import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Loader2, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KIND_LABELS, listTitle, type CellValue } from "@/lib/lists/kinds";
import type { Sheet, SheetField, SheetRow, TypeSummary } from "@/server/lists-store";
import { addListAction, deleteListAction, deleteTypeAction, renameTypeAction, setCellAction, typeUsageAction } from "./actions";
import { Cell, type SaveFn } from "./cells";
import { AddFieldDialog, FieldDialog } from "./FieldDialogs";
import { TypeNav } from "./TypeNav";

type Status = { state: "idle" } | { state: "saving" } | { state: "saved"; at: string } | { state: "error"; error: string };

export function ListsScreen({ types, sheet }: { types: TypeSummary[]; sheet: Sheet | null }) {
  if (!sheet)
    return (
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <TypeNav types={types} current="" />
        <p className="flex-1 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">עוד אין סוגי רשימות. מתחילים ב&quot;סוג רשימה&quot;.</p>
      </div>
    );
  return <Screen types={types} sheet={sheet} />;
}

function Screen({ types, sheet }: { types: TypeSummary[]; sheet: Sheet }) {
  const { type, fields } = sheet;
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const pending = useRef(0);
  const failedRef = useRef<Set<string>>(new Set());
  // The field whose settings are open, by key: a field just added opens as soon as the refreshed sheet has it.
  const [editing, setEditing] = useState<{ key: string; assign: boolean } | null>(null);
  const editingField = editing && fields.find((f) => f.key === editing.key);
  const [adding, setAdding] = useState(false);

  /** One save path for every cell: the chip says "saved" only when nothing is in flight and no cell is left failed. */
  const saver = useCallback(
    (rowId: string, key: string): SaveFn =>
      async (value: CellValue) => {
        const id = `${rowId}:${key}`;
        pending.current += 1;
        setStatus({ state: "saving" });
        let error = "";
        try {
          const r = await setCellAction(type.id, rowId, key, value);
          if (!r.ok) error = r.error;
        } catch {
          error = "השמירה נכשלה – בדקו את החיבור ונסו שוב";
        }
        pending.current -= 1;
        const next = new Set(failedRef.current);
        if (error) next.add(id);
        else next.delete(id);
        failedRef.current = next;
        setFailed(next);
        if (error) setStatus({ state: "error", error });
        else if (pending.current === 0)
          setStatus(next.size ? { state: "error", error: "יש תאים שלא נשמרו – מסומנים באדום" } : { state: "saved", at: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) });
        return !error;
      },
    [type.id],
  );

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <TypeNav types={types} current={type.id} />
      <section aria-labelledby="sheet-title" className="min-w-0 flex-1 space-y-3">
        <SheetHeader type={type} status={status} onAddField={() => setAdding(true)} canAddRow={fields.length > 0} />
        {fields.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            עוד אין שדות לסוג הזה.{" "}
            <button type="button" className="font-medium text-primary underline" onClick={() => setAdding(true)}>הוספת שדה ראשון</button>
          </div>
        ) : (
          <>
            <DesktopTable sheet={sheet} failed={failed} saver={saver} onEditField={(f) => setEditing({ key: f.key, assign: false })} />
            <MobileFieldList fields={fields} onEditField={(f) => setEditing({ key: f.key, assign: false })} />
            <MobileCards sheet={sheet} failed={failed} saver={saver} />
          </>
        )}
      </section>
      <AddFieldDialog
        open={adding}
        onClose={() => setAdding(false)}
        typeId={type.id}
        types={types}
        // A choice field goes straight on to "which records get which values".
        onCreated={(key, kind) => kind === "select" && sheet.rows.length > 0 && setEditing({ key, assign: true })}
      />
      {editingField && (
        <FieldDialog key={editingField.key} field={editingField} typeId={type.id} rows={sheet.rows} fields={fields} assignFirst={editing.assign} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function SaveChip({ status }: { status: Status }) {
  if (status.state === "idle") return null;
  return (
    <p role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-sm">
      {status.state === "saving" && (
        <>
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden /> <span className="text-muted-foreground">שומר…</span>
        </>
      )}
      {status.state === "saved" && (
        <>
          <Check className="size-4 text-success" aria-hidden /> <span className="text-muted-foreground">כל השינויים נשמרו · {status.at}</span>
        </>
      )}
      {status.state === "error" && (
        <>
          <AlertCircle className="size-4 text-destructive" aria-hidden /> <span className="text-destructive">{status.error}</span>
        </>
      )}
    </p>
  );
}

function SheetHeader({ type, status, onAddField, canAddRow }: { type: TypeSummary; status: Status; onAddField: () => void; canAddRow: boolean }) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState<{ lists: number; pointedBy: string[] } | null>(null);
  const [name, setName] = useState(type.name);
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <h2 id="sheet-title" className="text-xl font-semibold">{type.name}</h2>
      {!type.builtin && (
        <>
          <Button variant="ghost" size="icon" aria-label="שינוי שם הסוג" onClick={() => { setName(type.name); setError(""); setRenaming(true); }}>
            <Pencil className="size-4" aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" aria-label="מחיקת הסוג" onClick={() => start(async () => { setError(""); setDeleting(await typeUsageAction(type.id)); })}>
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </>
      )}
      <SaveChip status={status} />
      {/* The two ways to grow the table, side by side and alike: a row (a record) and a column (a field). */}
      <div className="ms-auto flex gap-2">
        {canAddRow && <AddRow typeId={type.id} isOrg={type.id === "org"} />}
        <Button variant="outline" className="gap-1" onClick={onAddField}>
          <Plus className="size-4" aria-hidden /> שדה
        </Button>
      </div>

      <Dialog open={renaming} onClose={() => setRenaming(false)} title="שינוי שם הסוג">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await renameTypeAction(type.id, name);
              if (!r.ok) return setError(r.error);
              setRenaming(false);
            });
          }}
        >
          <Input aria-label="שם הסוג" value={name} onChange={(e) => setName(e.target.value)} autoFocus required maxLength={80} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRenaming(false)}>ביטול</Button>
            <Button type="submit" disabled={busy}>שמירה</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={!!deleting} onClose={() => setDeleting(null)} title={`מחיקת "${type.name}"`}>
        {deleting && (
          <div className="space-y-3 text-sm">
            {deleting.pointedBy.length > 0 ? (
              <p>אי אפשר למחוק: {deleting.pointedBy.join(", ")} משויכים לסוג הזה. קודם מוחקים שם את השדה המשייך.</p>
            ) : (
              <p>{deleting.lists === 1 ? "רשומה אחת תימחק יחד איתו, עם כל הערכים שבה." : deleting.lists ? `${deleting.lists} רשומות ימחקו יחד איתו, עם כל הערכים שבהן.` : "אין בו רשומות."} אי אפשר לבטל את זה.</p>
            )}
            {error && <p role="alert" className="text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleting(null)}>ביטול</Button>
              {deleting.pointedBy.length === 0 && (
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() =>
                    start(async () => {
                      const r = await deleteTypeAction(type.id);
                      if (!r.ok) return setError(r.error);
                      setDeleting(null);
                      router.push("/admin/lists");
                    })
                  }
                >
                  מחיקה
                </Button>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

const refsFor = (sheet: Sheet, f: SheetField) => (f.kind === "ref" && f.parentTypeId ? sheet.refs[f.parentTypeId] : undefined);

function DesktopTable({ sheet, failed, saver, onEditField }: { sheet: Sheet; failed: Set<string>; saver: (r: string, k: string) => SaveFn; onEditField: (f: SheetField) => void }) {
  const { type, fields, rows } = sheet;
  return (
    <div className="hidden overflow-x-auto rounded-lg border md:block">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted/60">
          <tr>
            {fields.map((f) => (
              <th key={f.id} scope="col" className="border-b border-e p-0 text-start font-medium last:border-e-0">
                <button
                  type="button"
                  onClick={() => onEditField(f)}
                  className="group flex min-h-11 w-full items-center justify-between gap-2 px-3 text-start hover:bg-muted"
                  aria-label={`הגדרות השדה ${f.label}`}
                >
                  <span>
                    {f.label}
                    <span className="ms-2 text-xs font-normal text-muted-foreground">{KIND_LABELS[f.kind]}{f.multi ? " · כמה" : ""}</span>
                  </span>
                  <Settings2 className="size-4 text-muted-foreground opacity-60 group-hover:opacity-100" aria-hidden />
                </button>
              </th>
            ))}
            {type.id !== "org" && <th scope="col" className="w-12 border-b"><span className="sr-only">מחיקה</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={fields.length + 1} className="p-6 text-center text-muted-foreground">עוד אין רשומות. מוסיפים ב„+ רשומה” למעלה.</td>
            </tr>
          )}
          {rows.map((r) => {
            const title = listTitle(r.values, fields);
            return (
              <tr key={r.id} className="border-b last:border-b-0">
                {fields.map((f) => (
                  <td key={f.id} className="border-e p-0 last:border-e-0">
                    <Cell typeId={type.id} field={f} value={r.values[f.key]} refs={refsFor(sheet, f)} label={`${f.label} – ${title}`} failed={failed.has(`${r.id}:${f.key}`)} save={saver(r.id, f.key)} />
                  </td>
                ))}
                {type.id !== "org" && (
                  <td className="p-0 text-center">
                    <DeleteRow typeId={type.id} row={r} title={title} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** On phones there is no column header to click: the fields' settings are a row of chips above the cards. */
function MobileFieldList({ fields, onEditField }: { fields: SheetField[]; onEditField: (f: SheetField) => void }) {
  return (
    <div className="md:hidden">
      <p className="mb-1 text-xs text-muted-foreground">הגדרות שדה:</p>
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {fields.map((f) => (
          <li key={f.id} className="shrink-0">
            <Button variant="outline" size="sm" className="gap-1" onClick={() => onEditField(f)}>
              <Settings2 className="size-4" aria-hidden /> {f.label}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MobileCards({ sheet, failed, saver }: { sheet: Sheet; failed: Set<string>; saver: (r: string, k: string) => SaveFn }) {
  const { type, fields, rows } = sheet;
  return (
    <ul className="space-y-3 md:hidden">
      {rows.length === 0 && <li className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">עוד אין רשומות.</li>}
      {rows.map((r) => {
        const title = listTitle(r.values, fields);
        return (
          <li key={r.id} className="space-y-3 rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">{title}</h3>
              {type.id !== "org" && <DeleteRow typeId={type.id} row={r} title={title} />}
            </div>
            {fields.map((f) => {
              const id = `m-${r.id}-${f.key}`;
              return (
                <div key={f.id} className="space-y-1">
                  <Label htmlFor={id} className="text-xs text-muted-foreground">{f.label}</Label>
                  <Cell typeId={type.id} id={id} boxed field={f} value={r.values[f.key]} refs={refsFor(sheet, f)} label={`${f.label} – ${title}`} failed={failed.has(`${r.id}:${f.key}`)} save={saver(r.id, f.key)} />
                </div>
              );
            })}
          </li>
        );
      })}
    </ul>
  );
}

function DeleteRow({ typeId, row, title }: { typeId: string; row: SheetRow; title: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  return (
    <>
      <Button variant="ghost" size="icon" aria-label={`מחיקת ${title}`} onClick={() => setOpen(true)}>
        <Trash2 className="size-4 text-muted-foreground" aria-hidden />
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`מחיקת "${title}"`}>
        <p className="text-sm">כל הערכים של הרשומה הזאת ימחקו. אי אפשר לבטל את זה.</p>
        {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() =>
              start(async () => {
                const r = await deleteListAction(typeId, row.id);
                if (!r.ok) return setError(r.error);
                setOpen(false);
              })
            }
          >
            מחיקה
          </Button>
        </div>
      </Dialog>
    </>
  );
}

/** A new record: an empty row for an ordinary type; an organization needs its name and number up front. */
function AddRow({ typeId, isOrg }: { typeId: string; isOrg: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [reg, setReg] = useState("");
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  const close = () => {
    setOpen(false);
    setName("");
    setReg("");
    setError("");
  };
  const add = (org?: { name: string; registrationNumber: string }) =>
    start(async () => {
      setError("");
      const r = await addListAction(typeId, org);
      if (!r.ok) return setError(r.error);
      close();
    });
  return (
    <>
      <Button variant="outline" className="gap-1" disabled={busy} onClick={() => (isOrg ? setOpen(true) : add())}>
        <Plus className="size-4" aria-hidden /> רשומה
      </Button>
      {!isOrg && error && !open && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {isOrg && (
        <Dialog open={open} onClose={close} title="עמותה או עסק חדש">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              add({ name, registrationNumber: reg });
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="new-org-name">שם העמותה או העסק</Label>
              <Input id="new-org-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-org-reg">ח&quot;פ</Label>
              <Input id="new-org-reg" value={reg} onChange={(e) => setReg(e.target.value)} required inputMode="numeric" dir="ltr" className="text-end" maxLength={12} />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={close}>ביטול</Button>
              <Button type="submit" disabled={busy}>הוספה</Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
