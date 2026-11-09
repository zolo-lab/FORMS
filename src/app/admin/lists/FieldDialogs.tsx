"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ORG_FIELD_TYPES } from "@/lib/fields/types";

/** An organization holds one line per field: the single-line kinds, or one option of a choice. */
const ORG_KINDS: readonly ListFieldKind[] = [...ORG_FIELD_TYPES, "select"];
import { KIND_LABELS, LIST_FIELD_KINDS, listTitle, type ListFieldKind } from "@/lib/lists/kinds";
import type { SheetField, SheetRow, TypeSummary } from "@/server/lists-store";
import { addFieldAction, deleteFieldAction, fieldUsageAction, setCellAction, updateFieldAction } from "./actions";
import { OptionsEditor } from "./OptionsEditor";

const KIND_HINTS: Partial<Record<ListFieldKind, string>> = {
  select: "רשימת אפשרויות קבועה (למשל: צפון / מרכז / דרום). אפשר לאפשר בחירה של כמה.",
  ref: "כל רשומה כאן שייכת לרשומה מסוג אחר – למשל חנות שייכת לעיר. כך בטופס, אחרי שבוחרים עיר, יוצגו רק החנויות שלה.",
};

export function AddFieldDialog({
  open,
  onClose,
  onCreated,
  typeId,
  types,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (key: string, kind: ListFieldKind) => void;
  typeId: string;
  types: TypeSummary[];
}) {
  const isOrg = typeId === "org";
  const kinds: readonly ListFieldKind[] = isOrg ? ORG_KINDS : LIST_FIELD_KINDS;
  const parents = types.filter((t) => !t.builtin && t.id !== typeId);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<ListFieldKind>("short_text");
  const [options, setOptions] = useState<string[]>([""]);
  const [multi, setMulti] = useState(false);
  const [parent, setParent] = useState("");
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  const close = () => {
    setLabel("");
    setKind("short_text");
    setOptions([""]);
    setMulti(false);
    setParent("");
    setError("");
    onClose();
  };
  return (
    <Dialog open={open} onClose={close} title="שדה חדש" fullScreenOnMobile>
      <form
        className="flex flex-1 flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await addFieldAction(typeId, { label, kind, options, multi, parentTypeId: parent || null });
            if (!r.ok) return setError(r.error);
            const made = kind;
            close();
            onCreated(r.key, made);
          });
        }}
      >
        <p className="text-sm text-muted-foreground">השדה יתווסף כעמודה לכל הרשומות מהסוג הזה, וכל אחת תמלא בו ערך משלה.</p>
        <div className="space-y-1.5">
          <Label htmlFor="field-label">שם השדה</Label>
          <Input id="field-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="למשל: מייל להזמנות" autoFocus required maxLength={80} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="field-kind">סוג</Label>
          <Select id="field-kind" value={kind} onChange={(e) => setKind(e.target.value as ListFieldKind)}>
            {kinds.map((k) => (
              <option key={k} value={k} disabled={k === "ref" && parents.length === 0}>
                {KIND_LABELS[k]}
                {k === "ref" && parents.length === 0 ? " – צריך קודם עוד סוג רשימה" : ""}
              </option>
            ))}
          </Select>
          {KIND_HINTS[kind] && <p className="text-xs text-muted-foreground">{KIND_HINTS[kind]}</p>}
          {isOrg && kind === "select" && multi && <p className="text-xs text-muted-foreground">בבחירה של כמה אפשרויות, הטופס יקבל אותן בשורה אחת מופרדות בפסיקים.</p>}
          {!isOrg && parents.length === 0 && (
            <p className="text-xs text-muted-foreground">
              &quot;שייך ל…&quot; מקשר כל רשומה כאן לרשומה מסוג רשימה אחר (למשל חנות → עיר). כשיהיה עוד סוג רשימה, הוא יופיע כאן.
            </p>
          )}
        </div>
        {kind === "select" && (
          <>
            <OptionsEditor value={options} onChange={setOptions} />
            <p className="text-xs text-muted-foreground">בשלב הבא בוחרים לאילו רשומות שייכת כל אפשרות.</p>
                        <label className="flex min-h-11 items-center gap-2 text-sm">
              <Checkbox checked={multi} onChange={(e) => setMulti(e.target.checked)} /> אפשר לבחור כמה אפשרויות
            </label>
          </>
        )}
        {kind === "ref" && (
          <div className="space-y-1.5">
            <Label htmlFor="field-parent">שייך ל…</Label>
            <Select id="field-parent" value={parent} onChange={(e) => setParent(e.target.value)} required>
              <option value="">בחרו סוג רשימה</option>
              {parents.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="mt-auto flex justify-end gap-2 border-t pt-3">
          <Button variant="outline" onClick={close}>ביטול</Button>
          <Button type="submit" disabled={busy}>{busy ? "מוסיף…" : "הוספה"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Settings of an existing field: its name, its options, and – only on request – the internal name. */
export function FieldDialog({
  field,
  typeId,
  rows,
  fields,
  assignFirst,
  onClose,
}: {
  field: SheetField;
  typeId: string;
  rows: SheetRow[];
  fields: SheetField[];
  assignFirst: boolean;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(field.label);
  const [options, setOptions] = useState<string[]>(field.options.length ? field.options : [""]);
  const [multi, setMulti] = useState(field.multi);
  const [dev, setDev] = useState(false);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  const isOrg = typeId === "org";
  const [kind, setKind] = useState<ListFieldKind>(field.kind);
  const select = kind === "select";
  const kinds = (isOrg ? ORG_KINDS : LIST_FIELD_KINDS).filter((k) => k !== "ref");
  const changeKind = (k: ListFieldKind) => {
    setKind(k);
    // A field turned into a choice starts with the values its records already hold.
    if (k === "select" && field.kind !== "select" && !options.some((o) => o.trim())) {
      const found = [...new Set(rows.flatMap((r) => [r.values[field.key]].flat()).filter((v): v is string => typeof v === "string" && !!v.trim()).map((v) => v.trim()))];
      setOptions(found.length ? found : [""]);
    }
  };
  const asArray = (v: unknown) => (Array.isArray(v) ? (v as string[]) : typeof v === "string" && v ? [v] : []);
  // Only what was changed here; every other record shows its current value, even if it arrives after the dialog opened.
  const [changed, setChanged] = useState<Record<string, string[]>>({});
  const picks: Record<string, string[]> = Object.fromEntries(rows.map((r) => [r.id, changed[r.id] ?? asArray(r.values[field.key])]));
  const choices = options.map((o) => o.trim()).filter(Boolean);
  const saveCells = async () => {
    // Only the records whose choice changed, each kept to the options that are left.
    const failed: string[] = [];
    for (const row of rows) {
      const edit = changed[row.id];
      if (!edit) continue;
      const next = edit.filter((p) => choices.includes(p));
      const r = await setCellAction(typeId, row.id, field.key, multi || field.multi ? next : (next[0] ?? ""));
      if (!r.ok) failed.push(listTitle(row.values, fields));
    }
    return failed;
  };
  const save = () =>
    start(async () => {
      setError("");
      // One pick each: a record left with several is pointed out, never cut down unseen.
      if (select && !multi) {
        const many = rows.filter((r) => (picks[r.id] ?? []).length > 1).map((r) => listTitle(r.values, fields));
        if (many.length) return setError(`בחרו ערך אחד בלבד אצל: ${many.join(", ")}`);
      }
      // Going from several to one, the records are fixed first, so the field never holds a list it no longer allows.
      const cellsFirst = select && field.kind === "select" && field.multi && !multi;
      if (cellsFirst) {
        const failed = await saveCells();
        if (failed.length) return setError(`לא נשמר אצל: ${failed.join(", ")}`);
      }
      if (!field.fixed) {
        // A field just turned into a choice with no options typed takes the values its records hold (read on the server).
        const derive = select && kind !== field.kind && !options.some((o) => o.trim());
        const r = await updateFieldAction(typeId, field.id, { label, ...(kind !== field.kind ? { kind } : {}), ...(select ? { multi, ...(derive ? {} : { options }) } : {}) });
        if (!r.ok) return setError(r.error);
      }
      if (select && !cellsFirst) {
        const failed = await saveCells();
        if (failed.length) return setError(`לא נשמר אצל: ${failed.join(", ")}`);
      }
      onClose();
    });
  return (
    <Dialog open onClose={onClose} title={`השדה "${field.label}"`} fullScreenOnMobile>
      {confirm !== null ? (
        <div className="space-y-3 text-sm">
          <p>
            {confirm === 1 ? "רשומה אחת מילאה את השדה הזה, והערך שלה יימחק." : confirm ? `${confirm} רשומות מילאו את השדה הזה, והערכים שלהן ימחקו.` : "אף רשומה לא מילאה את השדה הזה."} טפסים שמושכים ממנו יפסיקו להתמלא.
            אי אפשר לבטל את זה.
          </p>
          {error && <p role="alert" className="text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)}>חזרה</Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                start(async () => {
                  const r = await deleteFieldAction(typeId, field.id);
                  if (!r.ok) return setError(r.error);
                  onClose();
                })
              }
            >
              מחיקת השדה
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="flex flex-1 flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (field.fixed) return onClose();
            save();
          }}
        >
          {field.fixed ? (
            <p className="text-sm text-muted-foreground">שדה קבוע של כל עמותה. את הערכים עורכים ישירות בטבלה.</p>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="edit-label">שם השדה</Label>
              <Input id="edit-label" value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={80} />
            </div>
          )}
          {field.fixed || field.kind === "ref" ? (
            <p className="text-sm">
              <span className="text-muted-foreground">סוג: </span>
              {KIND_LABELS[field.kind]}
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="edit-kind">סוג</Label>
              <Select id="edit-kind" value={kind} onChange={(e) => changeKind(e.target.value as ListFieldKind)}>
                {kinds.map((k) => (
                  <option key={k} value={k}>{KIND_LABELS[k]}</option>
                ))}
              </Select>
              {kind !== field.kind && <p className="text-xs text-muted-foreground">הערכים שכבר מולאו נשארים כמו שהם.</p>}
            </div>
          )}
          {select && !assignFirst && (
            <>
              <OptionsEditor value={options} onChange={setOptions} />
                            <label className="flex min-h-11 items-center gap-2 text-sm">
                <Checkbox checked={multi} onChange={(e) => setMulti(e.target.checked)} /> אפשר לבחור כמה אפשרויות
              </label>
            </>
          )}
          {select && rows.length > 0 && choices.length > 0 && (
            <AssignGrid rows={rows} fields={fields} choices={choices} multi={multi} picks={picks} onChange={(p) => setChanged({ ...changed, ...Object.fromEntries(Object.entries(p).filter(([id, v]) => JSON.stringify(v) !== JSON.stringify(picks[id]))) })} label={label} />
          )}
          <div className="text-sm">
            <button type="button" className="text-muted-foreground underline" aria-expanded={dev} onClick={() => setDev((v) => !v)}>
              פרטים למפתחים
            </button>
            {dev && (
              <p className="mt-1">
                שם פנימי: <code dir="ltr" className="rounded bg-muted px-1">{field.key}</code>
              </p>
            )}
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-3">
            {!field.fixed && (
              <Button
                variant="ghost"
                className="text-destructive"
                disabled={busy}
                onClick={() =>
                  start(async () => {
                    setError("");
                    setConfirm((await fieldUsageAction(typeId, field.key)).filled);
                  })
                }
              >
                מחיקת השדה…
              </Button>
            )}
            <Button variant="outline" className="ms-auto" onClick={onClose}>{field.fixed ? "סגירה" : "ביטול"}</Button>
            {!field.fixed && <Button type="submit" disabled={busy}>שמירה</Button>}
          </div>
        </form>
      )}
    </Dialog>
  );
}

/** Which records get which options: a record per line, an option per column – ticks for "several", one dot otherwise. */
function AssignGrid({
  rows,
  fields,
  choices,
  multi,
  picks,
  onChange,
  label,
}: {
  rows: SheetRow[];
  fields: SheetField[];
  choices: string[];
  multi: boolean;
  picks: Record<string, string[]>;
  onChange: (p: Record<string, string[]>) => void;
  label: string;
}) {
  const toggle = (rowId: string, o: string) => {
    const cur = picks[rowId] ?? [];
    const next = multi ? (cur.includes(o) ? cur.filter((x) => x !== o) : choices.filter((x) => x === o || cur.includes(x))) : cur[0] === o ? [] : [o];
    onChange({ ...picks, [rowId]: next });
  };
  const all = (o: string, on: boolean) =>
    onChange(Object.fromEntries(rows.map((r) => {
      const cur = picks[r.id] ?? [];
      if (!multi) return [r.id, on ? [o] : cur.filter((x) => x !== o)];
      return [r.id, on ? choices.filter((x) => x === o || cur.includes(x)) : cur.filter((x) => x !== o)];
    })));
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">לאילו רשומות שייך כל ערך?</legend>
      <p className="text-xs text-muted-foreground">{multi ? "אפשר לסמן כמה ערכים לכל רשומה." : "ערך אחד לכל רשומה. לחיצה נוספת מבטלת."} אפשר לשנות גם אחר כך, כאן או בטבלה.</p>
      <div className="max-h-80 overflow-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th scope="col" className="p-2 text-start font-medium">רשומה</th>
              {choices.map((o) => {
                const every = rows.every((r) => (picks[r.id] ?? []).includes(o));
                return (
                  <th key={o} scope="col" className="p-2 text-center font-medium">
                    <div>{o}</div>
                    <button type="button" className="text-xs font-normal text-primary underline" onClick={() => all(o, !every)}>
                      {every ? "אף אחד" : "לכולם"}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const title = listTitle(r.values, fields);
              return (
                <tr key={r.id} className="border-t">
                  <th scope="row" className="p-2 text-start font-normal">{title}</th>
                  {choices.map((o) => (
                    <td key={o} className="p-0 text-center">
                      <label className="flex min-h-11 cursor-pointer items-center justify-center">
                        <input
                          type={multi ? "checkbox" : "radio"}
                          name={multi ? undefined : `assign-${r.id}`}
                          className="size-5"
                          checked={(picks[r.id] ?? []).includes(o)}
                          onChange={() => toggle(r.id, o)}
                          // A second click on the picked one clears it (a radio fires no change for that).
                          onClick={() => !multi && (picks[r.id] ?? [])[0] === o && toggle(r.id, o)}
                          aria-label={`${label}: ${o} – ${title}`}
                        />
                      </label>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </fieldset>
  );
}
