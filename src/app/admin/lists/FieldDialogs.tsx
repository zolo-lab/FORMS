"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ORG_FIELD_TYPES } from "@/lib/fields/types";
import { KIND_LABELS, LIST_FIELD_KINDS, type ListFieldKind } from "@/lib/lists/kinds";
import type { SheetField, TypeSummary } from "@/server/lists-store";
import { addFieldAction, deleteFieldAction, fieldUsageAction, updateFieldAction } from "./actions";
import { OptionsEditor } from "./OptionsEditor";

const KIND_HINTS: Partial<Record<ListFieldKind, string>> = {
  select: "רשימת אפשרויות קבועה (למשל: צפון / מרכז / דרום). אפשר לאפשר בחירה של כמה.",
  ref: "כל רשומה כאן שייכת לרשומה מסוג אחר – למשל חנות שייכת לעיר. כך בטופס, אחרי שבוחרים עיר, יוצגו רק החנויות שלה.",
};

export function AddFieldDialog({ open, onClose, typeId, types }: { open: boolean; onClose: () => void; typeId: string; types: TypeSummary[] }) {
  const isOrg = typeId === "org";
  const kinds: readonly ListFieldKind[] = isOrg ? ORG_FIELD_TYPES : LIST_FIELD_KINDS;
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
            close();
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
                {k === "ref" && parents.length === 0 ? " (צריך עוד סוג רשימה)" : ""}
              </option>
            ))}
          </Select>
          {KIND_HINTS[kind] && <p className="text-xs text-muted-foreground">{KIND_HINTS[kind]}</p>}
          {isOrg && <p className="text-xs text-muted-foreground">לעמותות אפשר כרגע להוסיף שדות של שורה אחת.</p>}
        </div>
        {kind === "select" && (
          <>
            <OptionsEditor value={options} onChange={setOptions} />
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
export function FieldDialog({ field, typeId, onClose }: { field: SheetField; typeId: string; onClose: () => void }) {
  const [label, setLabel] = useState(field.label);
  const [options, setOptions] = useState<string[]>(field.options.length ? field.options : [""]);
  const [multi, setMulti] = useState(field.multi);
  const [dev, setDev] = useState(false);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  const select = field.kind === "select";
  return (
    <Dialog open onClose={onClose} title={`השדה "${field.label}"`} fullScreenOnMobile>
      {confirm !== null ? (
        <div className="space-y-3 text-sm">
          <p>
            {confirm ? `${confirm} רשומות מילאו את השדה הזה, והערכים שלהן ימחקו.` : "אף רשומה לא מילאה את השדה הזה."} טפסים שמושכים ממנו יפסיקו להתמלא.
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
            start(async () => {
              const r = await updateFieldAction(typeId, field.id, { label, ...(select ? { options, multi } : {}) });
              if (!r.ok) return setError(r.error);
              onClose();
            });
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
          <p className="text-sm">
            <span className="text-muted-foreground">סוג: </span>
            {KIND_LABELS[field.kind]}
          </p>
          {select && (
            <>
              <OptionsEditor value={options} onChange={setOptions} />
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <Checkbox checked={multi} onChange={(e) => setMulti(e.target.checked)} /> אפשר לבחור כמה אפשרויות
              </label>
            </>
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
