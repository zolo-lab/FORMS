/** Pure helpers for "fill on the document": which stamps get an input, and how input maps to answers. */
import type { PdfMapping, PdfStamp } from "@/lib/forms/pdf-mapping";
import { FIELD_TYPE_META } from "@/lib/forms/field-types";
import { allFields, type FormDefinition, type FormField } from "@/lib/forms/schema";

/** Any stamp-like object; only `part` / `whenValue` are read. */
type StampLike = { part?: string; whenValue?: string; [k: string]: unknown };

const NUMERIC = new Set(["number", "currency", "percent"]);

/**
 * Stamps that get an input on the page: top-level fields (no table cells) of this role's form.
 * `comb` (one box per character) and `initials` (the signer types the full name, the PDF shows initials)
 * are typed like text. date_signed / image / stamp_image have nothing to fill in.
 */
export const EDITABLE_KINDS: ReadonlySet<PdfStamp["kind"]> = new Set(["text", "comb", "initials", "check", "signature"]);

export function simpleStamps(mapping: PdfMapping, def: FormDefinition): PdfStamp[] {
  const ids = new Set(allFields(def).map((f) => f.id));
  return mapping.stamps.filter((s) => EDITABLE_KINDS.has(s.kind) && ids.has(s.fieldId));
}

/** HTML input attributes that match the field type, so phones show a number pad and dates a picker. */
export function inputAttrs(field: FormField): { type: string; inputMode?: "numeric" | "decimal" | "tel" | "email"; dir?: "ltr" } {
  switch (field.type) {
    case "date": return { type: "date", dir: "ltr" };
    case "time": return { type: "time", dir: "ltr" };
    case "id_number": return { type: "text", inputMode: "numeric", dir: "ltr" };
    case "phone": return { type: "tel", inputMode: "tel", dir: "ltr" };
    case "email": return { type: "email", inputMode: "email", dir: "ltr" };
    case "number": case "currency": case "percent": return { type: "text", inputMode: "decimal", dir: "ltr" };
    default: return { type: "text" };
  }
}

/** Fields the signer can't type into: computed by a formula or read-only. */
export function isComputedOrLocked(field: FormField): boolean {
  return !!field.formula || !!field.readOnly;
}

export function readText(_field: FormField, value: unknown, stamp: StampLike): string {
  const v = stamp.part && value && typeof value === "object" ? (value as Record<string, unknown>)[stamp.part] : value;
  return v === undefined || v === null ? "" : String(v);
}

export function writeText(field: FormField, current: unknown, stamp: StampLike, input: string): unknown {
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

export function readCheck(_field: FormField, value: unknown, stamp: StampLike): boolean {
  if (stamp.whenValue === undefined) return value === true || value === "yes";
  if (Array.isArray(value)) return value.includes(stamp.whenValue);
  return String(value) === stamp.whenValue;
}

export function writeCheck(field: FormField, current: unknown, stamp: StampLike, checked: boolean): unknown {
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
    .filter((f) => FIELD_TYPE_META[f.type].hasAnswer && f.type !== "hidden" && !isComputedOrLocked(f))
    .every((f) => placed.has(f.id));
}
