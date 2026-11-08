"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RecordField } from "@/lib/fields/record";
import { recordTitle } from "@/lib/fields/record";
import { deleteRecordAction, saveRecordAction } from "./actions";

type Row = { id: string; values: Record<string, string> };

/** The input that suits a field's type (the stored value is always text). */
function inputProps(type: RecordField["type"]): React.ComponentProps<"input"> {
  switch (type) {
    case "number":
    case "currency":
    case "percent":
      return { inputMode: "decimal", dir: "ltr" };
    case "id_number":
      return { inputMode: "numeric", dir: "ltr" };
    case "phone":
      return { type: "tel", inputMode: "tel", dir: "ltr" };
    case "email":
      return { type: "email", dir: "ltr" };
    case "date":
      return { type: "date" };
    default:
      return {};
  }
}

/**
 * The records of one list type (each supplier, each work place): a table, a search, and a window that adds or edits
 * one record with an input per field of the type.
 */
export function RecordsTable({ typeId, typeName, fields, displayKey, rows }: { typeId: string; typeName: string; fields: RecordField[]; displayKey: string | null; rows: Row[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ id: string | null; values: Record<string, string> } | null>(null);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => Object.values(r.values).some((v) => v.toLowerCase().includes(q))) : rows;
  }, [rows, query]);

  const open = (id: string | null, values: Record<string, string> = {}) => { setEditing({ id, values: { ...values } }); setProblems({}); setError(null); };
  const close = () => setEditing(null);

  const save = () =>
    start(async () => {
      if (!editing) return;
      try {
        const r = await saveRecordAction(typeId, editing.id, editing.values, fields.map((f) => f.key));
        if (!r.ok) { setProblems(r.problems ?? {}); setError(r.error ?? (r.problems ? "יש ערכים שצריך לתקן" : null)); return; }
      } catch {
        setError("השמירה נכשלה. נסו שוב.");
        return;
      }
      close();
      router.refresh();
    });

  const remove = (row: Row) => {
    const title = recordTitle(row.values, fields, displayKey) || "הרשומה";
    if (!confirm(`למחוק את "${title}" מ${typeName}?`)) return;
    setListError(null);
    start(async () => {
      try {
        await deleteRecordAction(typeId, row.id);
      } catch {
        setListError("המחיקה נכשלה. נסו שוב.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-start gap-2">
        <Button onClick={() => open(null)} disabled={fields.length === 0}><Plus className="size-4" aria-hidden />רשומה חדשה</Button>
        <div className="relative w-full max-w-xs">
          <Label htmlFor="rec-q" className="sr-only">חיפוש</Label>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="rec-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש" className="ps-9" />
        </div>
        <span className="text-sm text-muted-foreground">{rows.length} רשומות{query && ` · ${shown.length} תואמות`}</span>
      </div>

      {listError && <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{listError}</p>}
      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">לסוג הזה עדיין אין שדות. הוסיפו שדות בלשונית סוגי רשימות.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-max text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                {fields.map((f) => <th key={f.key} scope="col" className="px-3 py-2 text-start font-medium">{f.label}</th>)}
                <th scope="col" className="w-24 px-3 py-2"><span className="sr-only">פעולות</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  {fields.map((f) => (
                    <td key={f.key} className={f.key === displayKey ? "px-3 py-2 font-medium" : "px-3 py-2"}>
                      <bdi>{r.values[f.key] ?? ""}</bdi>
                    </td>
                  ))}
                  <td className="px-3 py-1">
                    <span className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" aria-label={`עריכת ${recordTitle(r.values, fields, displayKey)}`} onClick={() => open(r.id, r.values)}><Pencil className="size-4" aria-hidden /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive" aria-label={`מחיקת ${recordTitle(r.values, fields, displayKey)}`} disabled={pending} onClick={() => remove(r)}><Trash2 className="size-4" aria-hidden /></Button>
                    </span>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={fields.length + 1} className="px-3 py-6 text-center text-muted-foreground">{query ? "אין רשומות שתואמות לחיפוש" : "עדיין אין רשומות. הוסיפו את הראשונה."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!editing} onClose={close} title={editing?.id ? "עריכת רשומה" : "רשומה חדשה"} fullScreenOnMobile className="sm:w-[min(92vw,40rem)]">
        {editing && (
          <form
            className="space-y-4 p-5"
            onSubmit={(e) => { e.preventDefault(); save(); }}
          >
            <h2 className="text-lg font-semibold">{editing.id ? "עריכה" : "רשומה חדשה"} – {typeName}</h2>
            {error && <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((f, i) => (
                <div key={f.key} className="space-y-1">
                  <Label htmlFor={`rec-${f.key}`}>{f.label}</Label>
                  <Input
                    id={`rec-${f.key}`}
                    {...inputProps(f.type)}
                    value={editing.values[f.key] ?? ""}
                    onChange={(e) => { const v = e.target.value; setEditing((ed) => (ed ? { ...ed, values: { ...ed.values, [f.key]: v } } : ed)); }}
                    maxLength={500}
                    autoFocus={i === 0}
                    aria-invalid={!!problems[f.key]}
                    aria-describedby={problems[f.key] ? `rec-${f.key}-err` : undefined}
                  />
                  {problems[f.key] && <p id={`rec-${f.key}-err`} className="text-xs text-destructive">{problems[f.key]}</p>}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" aria-hidden />}שמירה</Button>
              <Button variant="ghost" onClick={close}>ביטול</Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
