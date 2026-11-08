/** One record of a list (a supplier, a work place): its values, checked against the type's fields. Pure, tested. */
import type { DictionaryType } from "./types";

export const MAX_RECORD_VALUE = 500;
export const MAX_RECORDS = 5000;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Why a value does not fit its field's type, or null. Empty values are fine (no field is required yet). */
export function valueProblem(type: DictionaryType, value: string): string | null {
  if (!value) return null;
  switch (type) {
    case "number":
    case "currency":
    case "percent":
      return /^-?\d+(\.\d+)?$/.test(value.replace(/,/g, "")) ? null : "צריך מספר";
    case "email":
      return EMAIL.test(value) ? null : "מייל לא תקין";
    case "phone":
      return /^\+?[\d\s-]{7,15}$/.test(value) ? null : "טלפון לא תקין";
    case "id_number":
      return /^\d{5,9}$/.test(value) ? null : "תעודת זהות: עד 9 ספרות";
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(value) ? null : "תאריך לא תקין";
    default:
      return null;
  }
}

export interface RecordField {
  key: string;
  label: string;
  type: DictionaryType;
}

/** The record's values: only the type's fields, trimmed, empty dropped; plus the problems found, by field key. */
export function cleanRecord(values: unknown, fields: RecordField[]): { values: Record<string, string>; problems: Record<string, string> } {
  const o = values && typeof values === "object" ? (values as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  const problems: Record<string, string> = {};
  for (const f of fields) {
    const raw = o[f.key];
    const v = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, MAX_RECORD_VALUE) : "";
    if (!v) continue;
    const p = valueProblem(f.type, v);
    if (p) problems[f.key] = p;
    else out[f.key] = v;
  }
  return { values: out, problems };
}

/** The text a record is known by: its display field, else its first non-empty value. */
export const recordTitle = (values: Record<string, string>, fields: { key: string }[], displayKey: string | null) =>
  (displayKey ? values[displayKey] : undefined) || fields.map((f) => values[f.key]).find(Boolean) || "";
