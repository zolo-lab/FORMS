/** Bulk send: map spreadsheet columns to request fields, convert cells, validate rows (pure). */
import type { FormDefinition, FormField } from "@/lib/forms/schema";
import { allFields } from "@/lib/forms/schema";
import { FIELD_TYPE_META } from "@/lib/forms/field-types";
import { validateAnswers } from "@/lib/forms/validate";
import { isValidEmail, isValidIsraeliId, isValidIsraeliPhone, normalizeIsraeliPhone } from "@/lib/validators/israeli";

export interface Target {
  /** `subject.name` … or `answers.<fieldId>` */
  key: string;
  label: string;
  required: boolean;
  /** Extra header spellings that should match automatically. */
  synonyms: string[];
}

export const SUBJECT_TARGETS: Target[] = [
  { key: "subject.name", label: "שם העובד", required: true, synonyms: ["שם", "שם מלא", "שם העובד", "name", "full name", "fullname"] },
  { key: "subject.idNumber", label: 'ת"ז', required: false, synonyms: ["תז", "תעודת זהות", "מספר זהות", "id", "id number", "מס זהות"] },
  { key: "subject.email", label: "מייל", required: false, synonyms: ["מייל", "אימייל", "דואל", "דוא״ל", "email", "e-mail", "כתובת מייל"] },
  { key: "subject.phone", label: "טלפון", required: false, synonyms: ["טלפון", "נייד", "טלפון נייד", "פלאפון", "phone", "mobile", "cell"] },
];

const norm = (s: string) => s.toLowerCase().replace(/[\s"'״׳.\-_:()]/g, "");

const SKIP_TYPES = new Set(["file_upload", "signature", "repeating_table", "hidden", "radio_grid", "checkbox_grid", "bank_account", "address", "full_name"]);

export function answerFields(def: FormDefinition): FormField[] {
  return allFields(def).filter((f) => FIELD_TYPE_META[f.type].hasAnswer && !SKIP_TYPES.has(f.type) && !f.formula);
}

export function targetsFor(def: FormDefinition): Target[] {
  return [
    ...SUBJECT_TARGETS,
    ...answerFields(def).map((f) => ({ key: `answers.${f.id}`, label: f.label, required: !!f.required, synonyms: [f.id] })),
  ];
}

/** target key → column index (or null). Each column is used once, subject targets get first pick. */
export function autoMap(headers: string[], targets: Target[]): Record<string, number | null> {
  const used = new Set<number>();
  const out: Record<string, number | null> = {};
  for (const t of targets) {
    const wanted = new Set([norm(t.label), ...t.synonyms.map(norm)]);
    const idx = headers.findIndex((h, i) => !used.has(i) && h.trim() !== "" && wanted.has(norm(h)));
    out[t.key] = idx >= 0 ? idx : null;
    if (idx >= 0) used.add(idx);
  }
  return out;
}

const YES = new Set(["כן", "yes", "y", "true", "1", "v", "✓", "x"]);
const NO = new Set(["לא", "no", "n", "false", "0"]);

function excelSerialToIso(n: number): string | null {
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Converts one cell to what the field stores (best effort; validateAnswers decides if it's acceptable). */
export function convertCell(field: FormField, raw: string): unknown {
  const v = raw.trim();
  if (v === "") return undefined;
  switch (field.type) {
    case "number": case "currency": case "percent": {
      const n = Number(v.replace(/[,₪%\s]/g, ""));
      return Number.isFinite(n) ? n : v;
    }
    case "date": {
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
      const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})$/.exec(v);
      if (m) {
        const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
        return `${y}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
      }
      return /^\d+(\.\d+)?$/.test(v) ? (excelSerialToIso(Number(v)) ?? v) : v;
    }
    case "yes_no": {
      const k = v.toLowerCase();
      return YES.has(k) ? "yes" : NO.has(k) ? "no" : v;
    }
    case "consent":
      return YES.has(v.toLowerCase()) ? true : v;
    case "phone": {
      const d = v.replace(/[^\d+]/g, "");
      return /^5\d{8}$/.test(d) ? `0${d}` : v;
    }
    case "id_number":
      return /^\d{5,8}$/.test(v) ? v.padStart(9, "0") : v;
    case "radio": case "dropdown": {
      const o = field.options?.find((x) => x.value === v || x.label === v);
      return o ? o.value : v;
    }
    case "checkboxes": {
      const parts = v.split(/[,;|]/).map((p) => p.trim()).filter(Boolean);
      return parts.map((p) => field.options?.find((x) => x.value === p || x.label === p)?.value ?? p);
    }
    default:
      return v;
  }
}

export interface ImportRecord {
  /** 1-based row in the file (the header is row 1). */
  row: number;
  subject: { name: string; idNumber?: string; email?: string; phone?: string };
  answers: Record<string, unknown>;
}

export interface RowError {
  row: number;
  message: string;
}

export function buildRecords(rows: string[][], mapping: Record<string, number | null>, def: FormDefinition): ImportRecord[] {
  const fields = new Map(answerFields(def).map((f) => [f.id, f]));
  const cell = (r: string[], key: string) => {
    const i = mapping[key];
    return i === null || i === undefined ? "" : (r[i] ?? "").trim();
  };
  return rows.slice(1).flatMap((r, i) => {
    if (r.every((c) => c.trim() === "")) return [];
    const answers: Record<string, unknown> = {};
    for (const [id, f] of fields) {
      const v = convertCell(f, cell(r, `answers.${id}`));
      if (v !== undefined) answers[id] = v;
    }
    const idNumber = cell(r, "subject.idNumber");
    const phone = cell(r, "subject.phone");
    return [
      {
        row: i + 2,
        subject: {
          name: cell(r, "subject.name"),
          ...(idNumber ? { idNumber: /^\d{5,8}$/.test(idNumber) ? idNumber.padStart(9, "0") : idNumber } : {}),
          ...(cell(r, "subject.email") ? { email: cell(r, "subject.email") } : {}),
          ...(phone ? { phone: /^5\d{8}$/.test(phone.replace(/\D/g, "")) ? `0${phone.replace(/\D/g, "")}` : phone } : {}),
        },
        answers,
      },
    ];
  });
}

/** Everything wrong with one record, in Hebrew; empty when it can be created. */
export function validateRecord(rec: ImportRecord, def: FormDefinition, opts: { send: boolean }): string[] {
  const errs: string[] = [];
  const s = rec.subject;
  if (!s.name.trim()) errs.push("חסר שם");
  if (s.email && !isValidEmail(s.email)) errs.push("מייל לא תקין");
  if (s.phone && !isValidIsraeliPhone(s.phone)) errs.push("טלפון לא תקין");
  if (s.idNumber && !isValidIsraeliId(s.idNumber)) errs.push('ת"ז לא תקינה');
  if (opts.send && !s.email && !(s.phone && normalizeIsraeliPhone(s.phone))) errs.push("חסר מייל או טלפון לשליחה");
  const labels = new Map(allFields(def).map((f) => [f.id, f.label]));
  const v = validateAnswers(def, rec.answers);
  if (!v.ok) for (const [k, m] of Object.entries(v.errors)) errs.push(`${labels.get(k.split(".")[0]!) ?? k}: ${m}`);
  return errs;
}

/** Duplicate ת"ז / email inside the file itself (one error per duplicated row). */
export function findDuplicates(records: ImportRecord[]): RowError[] {
  const seen = new Map<string, number>();
  const out: RowError[] = [];
  for (const r of records) {
    let dupOf: number | undefined;
    for (const key of [r.subject.idNumber ? `id:${r.subject.idNumber}` : "", r.subject.email ? `mail:${r.subject.email.toLowerCase()}` : ""]) {
      if (!key) continue;
      const first = seen.get(key);
      if (first !== undefined) dupOf ??= first;
      else seen.set(key, r.row);
    }
    if (dupOf !== undefined) out.push({ row: r.row, message: `כפילות עם שורה ${dupOf}` });
  }
  return out;
}
