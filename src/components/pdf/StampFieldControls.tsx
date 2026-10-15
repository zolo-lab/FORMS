"use client";
import { Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/checkbox";
import { DEFAULT_TYPES, DefaultValueRow, ListTextarea } from "@/components/builder/SettingsPanel";
import { CHARSET_LABELS, type Charset } from "@/lib/forms/charset";
import { FIELD_TYPE_META } from "@/lib/forms/field-types";
import type { PdfStamp } from "@/lib/forms/pdf-mapping";
import type { FormField } from "@/lib/forms/schema";

/** Types whose answer can be written either as plain text or one character per printed box. */
const COMB_ABLE = new Set<FormField["type"]>(["short_text", "id_number", "date", "phone", "number", "currency", "percent", "email"]);

/** Boxes a value usually needs: dates ddmmyyyy, ID 9, phone 10. */
export function combCellsFor(field: FormField): number {
  if (field.type === "date") return 8;
  if (field.type === "id_number") return 9;
  if (field.type === "phone") return 10;
  return 10;
}

/**
 * The field behind the selected stamp, edited right on the PDF tab: name, required, options of a choice
 * (and placing each option's X on the document), and whether the answer is written as text or in boxes.
 */
export function StampFieldControls({
  field,
  stamp,
  placed,
  onFieldPatch,
  onStampPatch,
  onPlaceOptions,
}: {
  field: FormField;
  stamp: PdfStamp;
  /** Whether the X of this option value is already on the document. */
  placed: (value: string) => boolean;
  onFieldPatch: (patch: Partial<FormField>) => void;
  onStampPatch: (patch: Partial<PdfStamp>) => void;
  onPlaceOptions: (values: string[]) => void;
}) {
  const hasOptions = FIELD_TYPE_META[field.type].hasOptions && !field.optionsSource;
  const options = field.options ?? [];
  const missing = options.filter((o) => !placed(o.value)).map((o) => o.value);
  return (
    <section aria-label="הגדרות השדה" className="space-y-2 rounded-md border p-2">
      <div className="space-y-1">
        <Label htmlFor={`stamp-field-label-${field.id}`} className="text-muted-foreground">שם השדה (מה שהממלא רואה)</Label>
        <Input id={`stamp-field-label-${field.id}`} className="h-9" value={field.label} onChange={(e) => onFieldPatch({ label: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`stamp-field-desc-${field.id}`} className="text-muted-foreground">הסבר (מופיע לממלא)</Label>
        <Input id={`stamp-field-desc-${field.id}`} className="h-9" value={field.description ?? ""} onChange={(e) => onFieldPatch({ description: e.target.value || undefined })} />
      </div>
      {FIELD_TYPE_META[field.type].hasAnswer && (
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={!!field.required} onCheckedChange={(c) => onFieldPatch({ required: c || undefined })} label="שדה חובה" />
          שדה חובה
        </label>
      )}
      {DEFAULT_TYPES.includes(field.type) && <DefaultValueRow field={field} onPatch={onFieldPatch} />}
      {FIELD_TYPE_META[field.type].hasAnswer && (
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={!!field.readOnly} onCheckedChange={(c) => onFieldPatch({ readOnly: c || undefined })} label="לקריאה בלבד" />
          לקריאה בלבד
        </label>
      )}
      {(field.type === "short_text" || field.type === "long_text") && (
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-3 space-y-1">
            <Label className="text-muted-foreground">סוג תווים</Label>
            <Select
              className="h-9"
              aria-label="סוג תווים"
              value={field.validation?.charset ?? ""}
              onChange={(e) => onFieldPatch({ validation: { ...field.validation, charset: (e.target.value || undefined) as Charset | undefined } })}
            >
              <option value="">כל התווים</option>
              {(Object.keys(CHARSET_LABELS) as Charset[]).map((c) => <option key={c} value={c}>{CHARSET_LABELS[c]}</option>)}
            </Select>
          </div>
          <LengthInput label="מינימום תווים" value={field.validation?.minLength} onChange={(n) => onFieldPatch({ validation: { ...field.validation, minLength: n } })} />
          <LengthInput label="מקסימום תווים" value={field.validation?.maxLength} onChange={(n) => onFieldPatch({ validation: { ...field.validation, maxLength: n } })} />
        </div>
      )}
      {(stamp.kind === "text" || stamp.kind === "comb") && COMB_ABLE.has(field.type) && (
        <div className="space-y-1">
          <Label className="text-muted-foreground">צורת הכתיבה על המסמך</Label>
          <Select
            className="h-9"
            aria-label="צורת הכתיבה על המסמך"
            value={stamp.kind}
            onChange={(e) => onStampPatch(e.target.value === "comb" ? { kind: "comb", comb: { cells: stamp.comb?.cells ?? combCellsFor(field) } } : { kind: "text", comb: undefined })}
          >
            <option value="text">טקסט רגיל</option>
            <option value="comb">תו בכל תא (תאים מודפסים)</option>
          </Select>
        </div>
      )}
      <p className="text-xs text-muted-foreground">שם מזהה: <bdi dir="ltr" className="font-mono">{field.id}</bdi> (משנים בלשונית השאלות ← מתקדם)</p>
      {hasOptions && (
        <div className="space-y-1">
          <Label className="text-muted-foreground">אפשרויות (שורה לכל אפשרות)</Label>
          <ListTextarea key={field.id} rows={Math.min(8, Math.max(3, options.length + 1))} items={options} onChange={(next) => onFieldPatch({ options: next })} />
          {field.type !== "dropdown" && options.length > 0 && (
            <ul aria-label="סימון האפשרויות על המסמך" className="space-y-1">
              {options.map((o) => (
                <li key={o.value} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 truncate">{placed(o.value) ? "✓ " : ""}X ליד &quot;{o.label}&quot;</span>
                  {!placed(o.value) && (
                    <Button variant="ghost" size="sm" aria-label={`מיקום X ליד ${o.label}`} onClick={() => onPlaceOptions([o.value])}><Crosshair className="size-4" /></Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {field.type !== "dropdown" && missing.length > 1 && (
            <Button size="sm" variant="outline" onClick={() => onPlaceOptions(missing)}>מיקום כל האפשרויות שחסרות ({missing.length})</Button>
          )}
        </div>
      )}
    </section>
  );
}

function LengthInput({ label, value, onChange }: { label: string; value: number | undefined; onChange: (n: number | undefined) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        dir="ltr"
        min={0}
        className="h-9 text-start"
        aria-label={label}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Math.max(0, Math.floor(Number(e.target.value))) || undefined)}
      />
    </div>
  );
}
