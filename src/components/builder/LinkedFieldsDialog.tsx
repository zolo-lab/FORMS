"use client";
import { useState } from "react";
import { AlertTriangle, Check, Link2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FIELD_TYPE_META } from "@/lib/forms/field-types";
import {
  addLinkedField,
  addPicker,
  bindField,
  fieldTypeFor,
  fits,
  linkedById,
  linkReport,
  listSource,
  pickerFor,
  pickerOf,
  unbindField,
  type LinkedListField,
  type LinkRow,
  type LinkSource,
} from "@/lib/forms/linked";
import { allFields, type FormDefinition } from "@/lib/forms/schema";
import { KIND_LABELS, isListFieldKind } from "@/lib/lists/kinds";

/** A list type forms can link to. The organizations are the built-in one. */
export interface LinkableType {
  id: string;
  name: string;
  fields: LinkedListField[];
}

/**
 * "שדות מקושרים": the form against one list. For every field of the list – the form field it fills (or gives its
 * options to), a form field with the same name to link in one click, or a warning that the form has no place for it
 * with a button that adds one. For a list other than the organizations, the filler picks the record in a dropdown
 * of the form (added here if missing). Every change goes straight into the form (and can be undone).
 */
export function LinkedFieldsDialog({
  open,
  onClose,
  def,
  listFields,
  types,
  page,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  def: FormDefinition;
  /** The organizations' list. */
  listFields: LinkedListField[];
  /** The other list types. */
  types: LinkableType[];
  /** Where a missing field is added: the page being edited. */
  page: number;
  onChange: (next: FormDefinition) => void;
}) {
  const [source, setSource] = useState<LinkSource>("org");
  const type = source === "org" ? null : types.find((t) => listSource(t.id) === source);
  const fieldsOfList = source === "org" ? listFields : (type?.fields ?? []);
  const rows = linkReport(def, fieldsOfList, source);
  const fields = allFields(def).filter((f) => FIELD_TYPE_META[f.type].hasAnswer);
  const byId = new Map(fields.map((f) => [f.id, f]));
  const suggested = rows.filter((r): r is Extract<LinkRow, { state: "suggested" }> => r.state === "suggested");
  const missing = rows.filter((r) => r.state === "missing");
  const picker = type ? pickerFor(def, type.id) : undefined;
  const typeName = type?.name ?? "עמותות ועסקים";

  const linkAll = () => onChange(suggested.reduce((d, r) => bindField(d, r.suggestion, r.field, source), def));
  const addAll = () => {
    let d = missing.reduce((d, r) => addLinkedField(d, r.field, page, source).def, def);
    if (type && !picker) d = addPicker(d, type.id, type.name, page).def;
    onChange(d);
  };

  return (
    <Dialog open={open} onClose={onClose} title="שדות מקושרים" className="w-[min(96vw,52rem)]" fullScreenOnMobile>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="link-source" className="font-medium">מאגר</Label>
            <Select id="link-source" value={source} onChange={(e) => setSource(e.target.value as LinkSource)} className="h-9 w-auto min-w-48">
              <option value="org">עמותות ועסקים</option>
              {types.map((t) => (
                <option key={t.id} value={listSource(t.id)}>{t.name}</option>
              ))}
            </Select>
            {source === "org" ? (
              <span className="text-muted-foreground">הרשומה נקבעת לפי העמותה של הבקשה (מהקישור או מהשליחה).</span>
            ) : picker ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Check className="size-4 text-success" aria-hidden /> הממלא בוחר את הרשומה בשדה «{picker.label}»
              </span>
            ) : (
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 font-medium">
                  <AlertTriangle className="size-4 text-warning" aria-hidden /> אין בטופס שדה לבחירת הרשומה
                </span>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => type && onChange(addPicker(def, type.id, type.name, page).def)}>
                  <Plus className="size-4" aria-hidden /> הוספת שדה «{typeName}»
                </Button>
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {source === "org"
              ? "שדה טקסט מתמלא מהעמותה ונעול לעריכה. שדה בחירה מציג רק את האפשרויות שסומנו לאותה עמותה במסך הרשימות."
              : `הממלא בוחר רשומה מתוך «${typeName}» (חיפוש לפי שם), והשדות המקושרים מתמלאים ממנה ונעולים. כשיש ברשימה רשומה אחת בלבד היא נבחרת מעצמה. שדה בחירה מציג רק את האפשרויות שסומנו לאותה רשומה.`}
          </p>
        </div>

        {fieldsOfList.length === 0 && (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            {types.length === 0 && source !== "org" ? "עוד אין סוגי רשימות." : "אין שדות ברשימה הזאת. מוסיפים אותם במסך הרשימות."}
          </p>
        )}

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
            // Nor a picker: it chooses the record for the other fields.
            const candidates = fields.filter((f) => !bound.includes(f.id) && !linkedById(f.id) && !pickerOf(f) && fits(f, lf));
            return (
              <li key={lf.key} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-center">
                <div className="min-w-0">
                  <div className="font-medium">{lf.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {isListFieldKind(lf.kind) ? KIND_LABELS[lf.kind] : lf.kind} · שם פנימי{" "}
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
                      <Button size="sm" variant="outline" onClick={() => onChange(bindField(def, r.suggestion, lf, source))}>קישור</Button>
                    </span>
                  )}

                  {r.state === "missing" && (
                    <span className="inline-flex flex-wrap items-center gap-2 text-sm">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <AlertTriangle className="size-4 text-warning" aria-hidden /> לא נמצא בטופס
                      </span>
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => onChange(addLinkedField(def, lf, page, source).def)}>
                        <Plus className="size-4" aria-hidden /> הוספה כ{FIELD_TYPE_META[fieldTypeFor(lf)].label}
                      </Button>
                    </span>
                  )}

                  {candidates.length > 0 && (
                    <Select
                      aria-label={`קישור ${lf.label} לשדה אחר בטופס`}
                      value=""
                      onChange={(e) => e.target.value && onChange(bindField(def, e.target.value, lf, source))}
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
