/**
 * Validate a submission's answers against a form definition.
 *
 * Rules:
 *  - Hidden fields/pages (visibleIf false) are skipped and their values dropped.
 *  - Only fields assigned to `role` are validated when a role is given
 *    (each signer in the chain validates only their own part).
 *  - Error messages are Hebrew and user-facing.
 */
import { evaluateCondition, type Answers } from "./conditions";
import { FIELD_TYPE_META } from "./field-types";
import type { FillerRole, FormDefinition, FormField } from "./schema";
import {
  isValidBankAccount,
  isValidEmail,
  isValidIsraeliId,
  isValidIsraeliPhone,
  isValidIsraeliZip,
} from "@/lib/validators/israeli";

export type FieldErrors = Record<string, string>;

export interface ValidateOptions {
  role?: FillerRole;
  /** Today's date as yyyy-mm-dd (injectable for tests). */
  today?: string;
}

const MSG = {
  required: "שדה חובה",
  number: "יש להזין מספר",
  min: (n: number) => `ערך מינימלי: ${n}`,
  max: (n: number) => `ערך מקסימלי: ${n}`,
  minLength: (n: number) => `לפחות ${n} תווים`,
  maxLength: (n: number) => `עד ${n} תווים`,
  pattern: "הערך אינו בפורמט הנדרש",
  option: "יש לבחור מהאפשרויות",
  minSelected: (n: number) => `יש לבחור לפחות ${n}`,
  maxSelected: (n: number) => `ניתן לבחור עד ${n}`,
  date: "תאריך לא תקין",
  minDate: (d: string) => `התאריך צריך להיות ${d} או מאוחר יותר`,
  maxDate: (d: string) => `התאריך צריך להיות ${d} או מוקדם יותר`,
  time: "שעה לא תקינה",
  email: "כתובת דוא\"ל לא תקינה",
  phone: "מספר טלפון לא תקין",
  id: "מספר תעודת זהות לא תקין",
  bank: "פרטי חשבון הבנק לא תקינים",
  zip: "מיקוד צריך להכיל 7 ספרות",
  consent: "יש לאשר כדי להמשיך",
  signature: "נדרשת חתימה",
  files: (n: number) => `ניתן להעלות עד ${n} קבצים`,
  fileSize: (n: number) => `גודל קובץ מקסימלי ${n}MB`,
  rows: (n: number) => `נדרשות לפחות ${n} שורות`,
  maxRows: (n: number) => `ניתן להוסיף עד ${n} שורות`,
  grid: "יש למלא את כל השורות",
};

function isBlank(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.values(v as object).every(isBlank);
  return false;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[,₪%\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function resolveDate(d: string, today: string): string {
  return d === "today" ? today : d;
}

function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function optionValues(field: FormField): Set<string> | null {
  // Dynamic sources (banks, cities…) are validated server-side against lookup tables.
  if (field.optionsSource || !field.options) return null;
  return new Set(field.options.map((o) => o.value));
}

/** Validate one present (non-blank) value. Returns an error message or null. */
function validateValue(field: FormField, value: unknown, opts: Required<Pick<ValidateOptions, "today">>): string | null {
  const v = field.validation ?? {};
  switch (field.type) {
    case "short_text":
    case "long_text":
    case "hidden": {
      if (typeof value !== "string") return field.type === "hidden" ? null : MSG.pattern;
      if (v.minLength !== undefined && value.trim().length < v.minLength) return MSG.minLength(v.minLength);
      if (v.maxLength !== undefined && value.length > v.maxLength) return MSG.maxLength(v.maxLength);
      if (v.pattern && !new RegExp(v.pattern).test(value)) return v.patternMessage ?? MSG.pattern;
      return null;
    }
    case "number":
    case "currency":
    case "percent":
    case "linear_scale":
    case "rating": {
      const n = toNumber(value);
      if (n === null) return MSG.number;
      const s = field.settings ?? {};
      const min = v.min ?? (field.type === "percent" ? 0 : (s.min as number | undefined));
      const max =
        v.max ?? (field.type === "percent" ? 100 : (s.max as number | undefined));
      if (field.type === "rating" && n < 1) return MSG.min(1);
      if (min !== undefined && n < min) return MSG.min(min);
      if (max !== undefined && n > max) return MSG.max(max);
      return null;
    }
    case "radio":
    case "dropdown": {
      if (typeof value !== "string") return MSG.option;
      const allowed = optionValues(field);
      if (allowed && !allowed.has(value) && !field.allowOther) return MSG.option;
      return null;
    }
    case "checkboxes": {
      if (!Array.isArray(value) || value.some((x) => typeof x !== "string")) return MSG.option;
      const allowed = optionValues(field);
      if (allowed && !field.allowOther && value.some((x) => !allowed.has(x as string))) return MSG.option;
      if (v.minSelected !== undefined && value.length < v.minSelected) return MSG.minSelected(v.minSelected);
      if (v.maxSelected !== undefined && value.length > v.maxSelected) return MSG.maxSelected(v.maxSelected);
      return null;
    }
    case "yes_no":
      return value === "yes" || value === "no" ? null : MSG.option;
    case "date": {
      if (typeof value !== "string" || !isIsoDate(value)) return MSG.date;
      if (v.minDate && value < resolveDate(v.minDate, opts.today)) return MSG.minDate(resolveDate(v.minDate, opts.today));
      if (v.maxDate && value > resolveDate(v.maxDate, opts.today)) return MSG.maxDate(resolveDate(v.maxDate, opts.today));
      return null;
    }
    case "time":
      return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? null : MSG.time;
    case "email":
      return typeof value === "string" && isValidEmail(value) ? null : MSG.email;
    case "phone":
      return typeof value === "string" && isValidIsraeliPhone(value) ? null : MSG.phone;
    case "id_number":
      return typeof value === "string" && isValidIsraeliId(value) ? null : MSG.id;
    case "bank_account":
      return typeof value === "object" && value !== null && isValidBankAccount(value as Record<string, string>)
        ? null
        : MSG.bank;
    case "address": {
      if (typeof value !== "object" || value === null) return MSG.required;
      const a = value as Record<string, string | undefined>;
      if (!a.city?.trim() || !a.street?.trim() || !a.house?.trim()) return MSG.required;
      if (a.zip && !isValidIsraeliZip(a.zip)) return MSG.zip;
      return null;
    }
    case "consent":
      return value === true ? null : MSG.consent;
    case "signature": {
      const s = value as { image?: string } | null;
      return s && typeof s.image === "string" && s.image.length > 0 ? null : MSG.signature;
    }
    case "file_upload": {
      if (!Array.isArray(value)) return MSG.required;
      const max = v.maxFiles ?? 1;
      if (value.length > max) return MSG.files(max);
      if (v.maxSizeMb !== undefined) {
        const tooBig = value.some((f) => typeof f === "object" && f && Number((f as { size?: number }).size) > v.maxSizeMb! * 1024 * 1024);
        if (tooBig) return MSG.fileSize(v.maxSizeMb);
      }
      return null;
    }
    case "radio_grid":
    case "checkbox_grid": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return MSG.grid;
      if (field.required) {
        const rows = ((field.settings?.rows as { value: string }[] | undefined) ?? []).map((r) => r.value);
        const answered = value as Record<string, unknown>;
        if (rows.some((r) => isBlank(answered[r]))) return MSG.grid;
      }
      return null;
    }
    case "repeating_table": {
      if (!Array.isArray(value)) return MSG.required;
      const s = field.settings ?? {};
      const minRows = (s.minRows as number | undefined) ?? 0;
      const maxRows = s.maxRows as number | undefined;
      if (value.length < minRows) return MSG.rows(minRows);
      if (maxRows !== undefined && value.length > maxRows) return MSG.maxRows(maxRows);
      return null;
    }
    case "heading":
    case "info_text":
    case "image":
    case "divider":
      return null;
  }
}

function validateFieldList(
  fields: FormField[],
  answers: Answers,
  errors: FieldErrors,
  cleaned: Answers,
  opts: ValidateOptions & { today: string },
  prefix: string,
  scopeAnswers: Answers,
) {
  for (const field of fields) {
    if (!FIELD_TYPE_META[field.type].hasAnswer) continue;
    if (!evaluateCondition(field.visibleIf, scopeAnswers)) continue;
    const value = answers[field.id];
    const key = prefix + field.id;
    const mine = !opts.role || (field.filledBy ?? "employee") === opts.role;

    // Keep values of visible fields regardless of role (other signers' data is preserved).
    if (value !== undefined) cleaned[field.id] = value;
    if (!mine || field.readOnly) continue;

    const required = field.required || (field.requiredIf ? evaluateCondition(field.requiredIf, scopeAnswers) : false);
    if (isBlank(value)) {
      const minRows = field.type === "repeating_table" ? Number(field.settings?.minRows ?? 0) : 0;
      if (minRows > 0) errors[key] = MSG.rows(minRows);
      else if (required) errors[key] = field.type === "signature" ? MSG.signature : field.type === "consent" ? MSG.consent : MSG.required;
      continue;
    }
    const err = validateValue(field, value, opts);
    if (err) {
      errors[key] = err;
      continue;
    }
    // Nested rows of a repeating table: each row is its own scope for conditions.
    if (field.type === "repeating_table" && field.fields && Array.isArray(value)) {
      const rowsOut: Answers[] = [];
      value.forEach((row, i) => {
        const rowAnswers = (row ?? {}) as Answers;
        const rowCleaned: Answers = {};
        validateFieldList(field.fields!, rowAnswers, errors, rowCleaned, opts, `${key}.${i}.`, { ...scopeAnswers, ...rowAnswers });
        rowsOut.push(rowCleaned);
      });
      cleaned[field.id] = rowsOut;
    }
  }
}

export interface ValidationResult {
  ok: boolean;
  errors: FieldErrors;
  /** Answers with hidden fields removed — store this, not the raw input. */
  cleaned: Answers;
}

export function validateAnswers(form: FormDefinition, answers: Answers, options: ValidateOptions = {}): ValidationResult {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const errors: FieldErrors = {};
  const cleaned: Answers = {};
  for (const page of form.pages) {
    if (!evaluateCondition(page.visibleIf, answers)) continue;
    validateFieldList(page.fields, answers, errors, cleaned, { ...options, today }, "", answers);
  }
  return { ok: Object.keys(errors).length === 0, errors, cleaned };
}
