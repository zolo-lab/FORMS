/** Pure helpers for "fill on the document": which stamps get an input, and how input maps to answers. */
import type { PdfMapping, PdfStamp } from "@/lib/forms/pdf-mapping";
import { FIELD_TYPE_META } from "@/lib/forms/field-types";
import { allFields, type FormDefinition, type FormField } from "@/lib/forms/schema";

const NUMERIC = new Set(["number", "currency", "percent"]);

/** Stamps that can be edited in place: top-level fields (no table cells) of this role's form. */
export function simpleStamps(mapping: PdfMapping, def: FormDefinition): PdfStamp[] {
  const ids = new Set(allFields(def).map((f) => f.id));
  return mapping.stamps.filter((s) => (s.kind === "text" || s.kind === "check" || s.kind === "signature") && ids.has(s.fieldId));
}

export function readText(_field: FormField, value: unknown, stamp: Pick<PdfStamp, "part">): string {
  const v = stamp.part && value && typeof value === "object" ? (value as Record<string, unknown>)[stamp.part] : value;
  return v === undefined || v === null ? "" : String(v);
}

export function writeText(field: FormField, current: unknown, stamp: Pick<PdfStamp, "part">, input: string): unknown {
  if (stamp.part) {
    const obj = { ...((current && typeof current === "object" ? current : {}) as Record<string, unknown>) };
    if (input === "") delete obj[stamp.part];
    else obj[stamp.part] = input;
    return Object.keys(obj).length ? obj : undefined;
  }
  if (input === "") return undefined;
  if (NUMERIC.has(field.type)) {
    const n = Number(input);
    return Number.isFinite(n) ? n : input;
  }
  return input;
}

export function readCheck(_field: FormField, value: unknown, stamp: Pick<PdfStamp, "whenValue">): boolean {
  if (stamp.whenValue === undefined) return value === true || value === "yes";
  if (Array.isArray(value)) return value.includes(stamp.whenValue);
  return String(value) === stamp.whenValue;
}

export function writeCheck(field: FormField, current: unknown, stamp: Pick<PdfStamp, "whenValue">, checked: boolean): unknown {
  if (stamp.whenValue === undefined) return checked ? true : undefined;
  if (field.type === "checkboxes") {
    const list = Array.isArray(current) ? (current as string[]) : [];
    const next = checked ? (list.includes(stamp.whenValue) ? list : [...list, stamp.whenValue]) : list.filter((x) => x !== stamp.whenValue);
    return next.length ? next : undefined;
  }
  return checked ? stamp.whenValue : readCheck(field, current, stamp) ? undefined : current;
}

/** On-document mode is offered only when every answerable field of the role's form is placed on the PDF. */
export function coversAll(mapping: PdfMapping, def: FormDefinition): boolean {
  const placed = new Set(simpleStamps(mapping, def).map((s) => s.fieldId));
  return allFields(def)
    .filter((f) => FIELD_TYPE_META[f.type].hasAnswer && f.type !== "hidden")
    .every((f) => placed.has(f.id));
}
