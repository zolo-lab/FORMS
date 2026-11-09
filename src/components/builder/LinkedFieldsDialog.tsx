"use client";
import { AlertTriangle, Check, Link2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/input";
import { FIELD_TYPE_META } from "@/lib/forms/field-types";
import { addLinkedField, bindField, fieldTypeFor, fits, linkedById, linkReport, unbindField, type LinkRow, type OrgListField } from "@/lib/forms/linked";
import { allFields, type FormDefinition } from "@/lib/forms/schema";
import { KIND_LABELS, isListFieldKind } from "@/lib/lists/kinds";

/**
 * "שדות מקושרים": the form against the organizations' list. For every field of the list – the form field it fills
 * (or gives its options to), a form field with the same name to link in one click, or a warning that the form has no
 * place for it with a button that adds one. Every change goes straight into the form (and can be undone).
 */
export function LinkedFieldsDialog({
  open,
  onClose,
  def,
  listFields,
  page,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  def: FormDefinition;
  listFields: OrgListField[];
  /** Where a missing field is added: the page being edited. */
  page: number;
  onChange: (next: FormDefinition) => void;
}) {
  const rows = linkReport(def, listFields);
  const fields = allFields(def).filter((f) => FIELD_TYPE_META[f.type].hasAnswer);
  const byId = new Map(fields.map((f) => [f.id, f]));
  const suggested = rows.filter((r): r is Extract<LinkRow, { state: "suggested" }> => r.state === "suggested");
  const missing = rows.filter((r) => r.state === "missing");

  const linkAll = () => onChange(suggested.reduce((d, r) => bindField(d, r.suggestion, r.field), def));
  const addAll = () => onChange(missing.reduce((d, r) => addLinkedField(d, r.field, page).def, def));

  return (
    <Dialog open={open} onClose={onClose} title="שדות מקושרים" className="w-[min(96vw,52rem)]" fullScreenOnMobile>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p>
            <span className="font-medium">מאגר: עמותות ועסקים</span> · הרשומה נקבעת לפי העמותה של הבקשה (מהקישור או מהשליחה).
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            שדה טקסט מתמלא מהעמותה ונעול לעריכה. שדה בחירה מציג רק את האפשרויות שסומנו לאותה עמותה במסך הרשימות.
          </p>
        </div>

        {(suggested.length > 0 || missing.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {suggested.length > 0 && (
              <Button size="sm" onClick={linkAll} className="gap-1">
                <Link2 className="size-4" aria-hidden /> קישור כל ההצעות ({suggested.length})
              </Button>
            )}
            {missing.length > 0 && (
              <Button size="sm" variant="outline" onClick={addAll} className="gap-1">
                <Plus className="size-4" aria-hidden /> הוספת כל החסרים לטופס ({missing.length})
              </Button>
            )}
          </div>
        )}

        <ul className="min-h-0 flex-1 divide-y overflow-y-auto rounded-md border">
          {rows.map((r) => {
            const lf = r.field;
            const bound = r.state === "bound" ? r.formFieldIds : [];
            // org_name / org_number already show the name and number by their id: never re-linked to another field.
            const candidates = fields.filter((f) => !bound.includes(f.id) && !linkedById(f.id) && fits(f, lf));
            return (
              <li key={lf.key} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-center">
                <div className="min-w-0">
                  <div className="font-medium">{lf.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {isListFieldKind(lf.kind) ? KIND_LABELS[lf.kind] : lf.kind}
                    {" "}· שם פנימי{" "}
                    <code dir="ltr" className="rounded bg-muted px-1">{lf.key}</code>
                  </div>
                </div>

                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {bound.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 py-0.5 ps-2.5 pe-1 text-sm">
                      <Check className="size-4 text-success" aria-hidden />
                      <span className="truncate">{byId.get(id)?.label || id}</span>
                      <code dir="ltr" className="text-xs text-muted-foreground">{id}</code>
                      {linkedById(id) ? (
                        <span className="pe-1.5 text-xs text-muted-foreground" title="השדה מתמלא מהעמותה לפי המזהה שלו">לפי המזהה</span>
                      ) : (
                        <button type="button" aria-label={`ביטול הקישור של ${byId.get(id)?.label || id}`} className="flex size-8 items-center justify-center rounded-full hover:bg-muted" onClick={() => onChange(unbindField(def, id))}>
                          <X className="size-4" aria-hidden />
                        </button>
                      )}
                    </span>
                  ))}

                  {r.state === "suggested" && (
                    <span className="inline-flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">נמצא בטופס:</span>
                      <span className="font-medium">{byId.get(r.suggestion)?.label}</span>
                      <Button size="sm" variant="outline" onClick={() => onChange(bindField(def, r.suggestion, lf))}>קישור</Button>
                    </span>
                  )}

                  {r.state === "missing" && (
                    <span className="inline-flex flex-wrap items-center gap-2 text-sm">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <AlertTriangle className="size-4 text-warning" aria-hidden /> לא נמצא בטופס
                      </span>
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => onChange(addLinkedField(def, lf, page).def)}>
                        <Plus className="size-4" aria-hidden /> הוספה כ{FIELD_TYPE_META[fieldTypeFor(lf)].label}
                      </Button>
                    </span>
                  )}

                  {candidates.length > 0 && (
                    <Select
                      aria-label={`קישור ${lf.label} לשדה אחר בטופס`}
                      value=""
                      onChange={(e) => e.target.value && onChange(bindField(def, e.target.value, lf))}
                      className="h-9 w-auto min-w-40 text-sm"
                    >
                      <option value="">{bound.length ? "+ עוד שדה…" : "קישור לשדה אחר…"}</option>
                      {candidates.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label || f.id} · {f.id}
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex justify-end border-t pt-3">
          <Button onClick={onClose}>סגירה</Button>
        </div>
      </div>
    </Dialog>
  );
}
