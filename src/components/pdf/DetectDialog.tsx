"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { FIELD_TYPE_META } from "@/lib/forms/field-types";
import { REFINABLE_TYPES } from "@/lib/pdf/refine";
import type { DetectedField } from "@/lib/pdf/detect";

interface Row { include: boolean; label: string; type: DetectedField["type"]; key: string }

const KEY = /^[a-zA-Z][a-zA-Z0-9_]*$/;

const TEXT_TYPES = new Set<string>(REFINABLE_TYPES);

/**
 * "We found N fields": every place to write that the PDF showed, with the name and type the system read.
 * The admin unticks what is not a field, fixes a name or a text type, and adds the rest to the form.
 */
export function DetectDialog({
  fields,
  pageCount,
  canSplit,
  onConfirm,
  onClose,
}: {
  fields: DetectedField[] | null;
  pageCount: number;
  /** The form is empty and the PDF has several pages: offer one step per page. */
  canSplit: boolean;
  onConfirm: (fields: DetectedField[], opts: { stepPerPage: boolean }) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!fields} onClose={onClose} title="שדות שזוהו ב-PDF" className="w-[min(96vw,44rem)]" fullScreenOnMobile>
      {fields && <Body key={fields.map((f) => f.id).join(",")} fields={fields} pageCount={pageCount} canSplit={canSplit} onConfirm={onConfirm} onClose={onClose} />}
    </Dialog>
  );
}

function Body({ fields, pageCount, canSplit, onConfirm, onClose }: { fields: DetectedField[]; pageCount: number; canSplit: boolean; onConfirm: (f: DetectedField[], o: { stepPerPage: boolean }) => void; onClose: () => void }) {
  const [rows, setRows] = useState<Row[]>(() => fields.map((f) => ({ include: !f.skip, label: f.label, type: f.type, key: f.key ?? "" })));
  const [split, setSplit] = useState(canSplit);
  const patch = (i: number, p: Partial<Row>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const chosen = rows.filter((r) => r.include && r.label.trim()).length;
  const badKey = rows.some((r) => r.include && r.key.trim() && !KEY.test(r.key.trim()));

  function confirm() {
    const out = fields.flatMap((f, i) => {
      const r = rows[i]!;
      return r.include && r.label.trim() ? [{ ...f, label: r.label.trim(), type: r.type, key: r.key.trim() || undefined }] : [];
    });
    onConfirm(out, { stepPerPage: split });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 text-sm">
      <p className="text-muted-foreground">
        מצאנו <b className="text-foreground">{fields.length}</b> מקומות למילוי. בטלו סימון למה שאינו שדה, תקנו שם, סוג או מזהה, והשדות יתווספו לטופס וימוקמו על המסמך (אפשר להזיז אחר כך). המערכת זוכרת את התיקונים ומציעה אותם בפעם הבאה.
      </p>
      {fields.some((f) => f.skip) && (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-md bg-muted p-2">
          {fields.filter((f) => f.skip).length} הצעות לא מסומנות כי ביטלתם אותן בעבר.
          <Button size="sm" variant="outline" onClick={() => setRows((r) => r.map((x, i) => (fields[i]!.skip ? { ...x, include: true } : x)))}>סימון גם אותן</Button>
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setRows((r) => r.map((x) => ({ ...x, include: true })))}>סימון הכול</Button>
        <Button size="sm" variant="ghost" onClick={() => setRows((r) => r.map((x) => ({ ...x, include: false })))}>ניקוי הכול</Button>
      </div>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pe-1" aria-label="רשימת השדות שזוהו">
        {fields.map((f, i) => {
          const r = rows[i]!;
          return (
            <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2">
              <Checkbox checked={r.include} onChange={(e) => patch(i, { include: e.target.checked })} aria-label={`לכלול את ${r.label || f.label}`} />
              <Input
                value={r.label}
                onChange={(e) => patch(i, { label: e.target.value })}
                aria-label={`שם השדה ${f.label}`}
                aria-invalid={r.include && !r.label.trim()}
                disabled={!r.include}
                className="min-w-40 flex-1"
              />
              {TEXT_TYPES.has(f.type) ? (
                <Select value={r.type} onChange={(e) => patch(i, { type: e.target.value as Row["type"] })} aria-label={`סוג השדה ${f.label}`} disabled={!r.include} className="w-40">
                  {REFINABLE_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_META[t].label}</option>)}
                </Select>
              ) : (
                <span className="w-40 rounded-md bg-muted px-2 py-2 text-center text-muted-foreground">{FIELD_TYPE_META[f.type].label}</span>
              )}
              <Input
                value={r.key}
                onChange={(e) => patch(i, { key: e.target.value })}
                dir="ltr"
                placeholder="מזהה"
                aria-label={`מזהה השדה ${f.label}`}
                aria-invalid={r.include && !!r.key.trim() && !KEY.test(r.key.trim())}
                disabled={!r.include}
                className="w-44 font-mono text-xs"
              />
              {pageCount > 1 && <span className="text-xs text-muted-foreground">עמוד {f.page + 1}</span>}
              {f.learned && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary" title="לפי מה שבחרתם בפעם הקודמת שהופיעה התווית הזאת">
                  {f.skip ? "בוטל בעבר" : "לפי תיקון קודם"}
                </span>
              )}
              {f.columns && f.rows && (
                <span className="basis-full ps-7 text-xs text-muted-foreground">
                  עמודות: {f.columns.map((c) => c.label).join(" · ")} · {f.rows.length} שורות
                </span>
              )}
              {f.options && <span className="basis-full ps-7 text-xs text-muted-foreground">אפשרויות: {f.options.map((o) => o.label).join(" · ")}</span>}
            </li>
          );
        })}
      </ul>
      {canSplit && (
        <label className="flex items-center gap-2">
          <Checkbox checked={split} onChange={(e) => setSplit(e.target.checked)} />
          <span>שלב נפרד לכל עמוד ב-PDF (נוח למילוי בחלקים)</span>
        </label>
      )}
      {badKey && <p className="text-destructive">מזהה: אותיות לועזיות, ספרות וקו תחתון, מתחיל באות.</p>}
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button onClick={confirm} disabled={chosen === 0 || badKey} className="min-h-11">הוספת {chosen} שדות לטופס</Button>
        <Button variant="outline" onClick={onClose} className="min-h-11">אבנה ידנית</Button>
      </div>
    </div>
  );
}
