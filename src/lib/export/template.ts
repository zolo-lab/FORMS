/**
 * Export templates ("תבנית העלאה"): the admin uploads the file another system expects (e.g. the Priority
 * import sheet), each column of its header row is mapped once to a source, and every export afterwards
 * comes out in exactly that layout. Pure: no DB, so it is unit tested.
 */
import type { Answers } from "@/lib/forms/conditions";
import { formatAnswer, formatDateIL } from "@/lib/forms/format";
import { allFields, type FormDefinition, type FormField } from "@/lib/forms/schema";
import type { ExportRequest } from "./rows";

/** Request-level values every request has. */
export const FIXED_SOURCES = {
  id: "מזהה בקשה",
  subjectName: "שם העובד / הנמען",
  subjectIdNumber: 'ת"ז',
  organization: "ארגון",
  package: "ערכה",
  status: "סטטוס",
  createdAt: "תאריך יצירה",
} as const;
export type FixedSource = keyof typeof FIXED_SOURCES;

/**
 * How a value is written:
 * - text: as shown to people (option label, dd/mm/yyyy)
 * - code: an option's payroll code (option.code, else its value); other fields as text
 * - digits: only the digits (ID, phone, bank account)
 * - date_ddmmyyyy / date_iso: a date field in that shape
 * - number: a plain number without thousands separators
 */
export const VALUE_FORMATS = ["text", "code", "digits", "date_ddmmyyyy", "date_iso", "number"] as const;
export type ValueFormat = (typeof VALUE_FORMATS)[number];

export const VALUE_FORMAT_LABELS: Record<ValueFormat, string> = {
  text: "כפי שמוצג",
  code: "קוד (לאפשרויות)",
  digits: "ספרות בלבד",
  date_ddmmyyyy: "תאריך dd/mm/yyyy",
  date_iso: "תאריך yyyy-mm-dd",
  number: "מספר",
};

export type ColumnSource =
  | { kind: "empty" }
  | { kind: "const"; value: string }
  | { kind: "fixed"; key: FixedSource }
  /** A field by id (or export key); `part` = a sub-value of a composite field (bank.branch, address.city). */
  | { kind: "field"; key: string; part?: string };

export interface TemplateColumn {
  /** The header text exactly as in the uploaded file. */
  header: string;
  source: ColumnSource;
  format?: ValueFormat;
}

export interface ExportTemplate {
  name: string;
  columns: TemplateColumn[];
  /** Write the header row (most import formats want it). */
  includeHeader?: boolean;
  sheetName?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[\s"'״׳.\-_:()/\\]/g, "");

/** Every answer field of the forms, as `{ key, label }` choices for the mapping screen (parts of composites too). */
export function mappableFields(defs: FormDefinition[]): { key: string; part?: string; label: string; field: FormField }[] {
  const out: { key: string; part?: string; label: string; field: FormField }[] = [];
  const seen = new Set<string>();
  for (const def of defs) {
    for (const f of allFields(def)) {
      if (["heading", "info_text", "image", "divider", "section", "link", "file_upload", "signature", "repeating_table"].includes(f.type)) continue;
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push({ key: f.id, label: f.label || f.id, field: f });
      if (f.type === "bank_account") for (const [p, l] of [["bank", "בנק"], ["branch", "סניף"], ["account", "חשבון"]] as const) out.push({ key: f.id, part: p, label: `${f.label} – ${l}`, field: f });
      if (f.type === "address") for (const [p, l] of [["city", "יישוב"], ["street", "רחוב"], ["house", "מספר בית"], ["zip", "מיקוד"]] as const) out.push({ key: f.id, part: p, label: `${f.label} – ${l}`, field: f });
      if (f.type === "full_name") for (const [p, l] of [["first", "שם פרטי"], ["last", "שם משפחה"]] as const) out.push({ key: f.id, part: p, label: `${f.label} – ${l}`, field: f });
    }
  }
  return out;
}

/**
 * First guess for each header: a field whose id, export key or label matches it, else a fixed value with that
 * name, else empty. The admin then fixes what is wrong.
 */
export function guessColumns(headers: string[], defs: FormDefinition[]): TemplateColumn[] {
  const fields = mappableFields(defs).filter((m) => !m.part);
  const fixed = Object.entries(FIXED_SOURCES) as [FixedSource, string][];
  return headers.map((header) => {
    const h = norm(header);
    if (!h) return { header, source: { kind: "empty" } };
    const f = fields.find((m) => norm(m.key) === h || (m.field.exportKey && norm(m.field.exportKey) === h))
      ?? fields.find((m) => norm(m.label) === h);
    if (f) return { header, source: { kind: "field", key: f.key }, format: defaultFormat(f.field) };
    const fx = fixed.find(([k, label]) => norm(k) === h || norm(label) === h);
    if (fx) return { header, source: { kind: "fixed", key: fx[0] } };
    return { header, source: { kind: "empty" } };
  });
}

function defaultFormat(f: FormField): ValueFormat {
  if (f.type === "radio" || f.type === "dropdown" || f.type === "checkboxes") return f.options?.some((o) => o.code) ? "code" : "text";
  if (f.type === "id_number" || f.type === "phone") return "digits";
  return "text";
}

const day = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jerusalem" }).format(d);

function findField(defs: FormDefinition[], key: string): FormField | undefined {
  for (const d of defs) {
    const f = allFields(d).find((g) => g.id === key) ?? allFields(d).find((g) => g.exportKey === key);
    if (f) return f;
  }
  return undefined;
}

function codeOf(f: FormField, v: unknown): string {
  const one = (x: unknown) => {
    const o = f.options?.find((opt) => opt.value === x);
    return o ? (o.code ?? o.value) : String(x ?? "");
  };
  return Array.isArray(v) ? v.map(one).join(",") : one(v);
}

function applyFormat(f: FormField | undefined, raw: unknown, shown: string, format: ValueFormat): string {
  switch (format) {
    case "code":
      return f && (f.type === "radio" || f.type === "dropdown" || f.type === "checkboxes") ? codeOf(f, raw) : shown;
    case "digits":
      return shown.replace(/\D/g, "");
    case "date_iso":
      return typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : shown;
    case "date_ddmmyyyy":
      return typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw) ? formatDateIL(raw.slice(0, 10)) : shown;
    case "number": {
      const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/[,₪%\s]/g, ""));
      return raw === undefined || raw === null || raw === "" || !Number.isFinite(n) ? "" : String(n);
    }
    default:
      return shown;
  }
}

/** One cell of one request. */
export function cellValue(col: TemplateColumn, r: ExportRequest): string {
  const format = col.format ?? "text";
  const s = col.source;
  switch (s.kind) {
    case "empty":
      return "";
    case "const":
      return s.value;
    case "fixed": {
      const v = s.key === "createdAt" ? day(r.createdAt) : String(r[s.key] ?? "");
      if (s.key === "createdAt" && format === "date_ddmmyyyy") return formatDateIL(v);
      return format === "digits" ? v.replace(/\D/g, "") : v;
    }
    case "field": {
      const f = findField(r.definitions, s.key);
      const raw: unknown = f ? (r.answers as Answers)[f.id] : undefined;
      const value = s.part && raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>)[s.part] : raw;
      const shown = f ? (s.part ? (value === undefined || value === null ? "" : String(value)) : formatAnswer(f, raw)) : "";
      return applyFormat(s.part ? undefined : f, value, shown, format);
    }
  }
}

/** The rows of the export in the template's layout: header row (unless turned off), then one row per request. */
export function applyTemplate(t: ExportTemplate, requests: ExportRequest[]): string[][] {
  const body = requests.map((r) => t.columns.map((c) => cellValue(c, r)));
  return t.includeHeader === false ? body : [t.columns.map((c) => c.header), ...body];
}

/** Parse a stored template (jsonb) defensively; bad columns become empty ones. */
export function readTemplate(raw: unknown): ExportTemplate {
  const o = (raw ?? {}) as Partial<ExportTemplate>;
  const cols = Array.isArray(o.columns) ? o.columns : [];
  return {
    name: String(o.name ?? ""),
    includeHeader: o.includeHeader !== false,
    sheetName: o.sheetName ? String(o.sheetName) : undefined,
    columns: cols.map((c) => {
      const src = (c?.source ?? { kind: "empty" }) as ColumnSource;
      const okSource: ColumnSource =
        src.kind === "const" ? { kind: "const", value: String(src.value ?? "") }
          : src.kind === "fixed" && src.key in FIXED_SOURCES ? { kind: "fixed", key: src.key }
            : src.kind === "field" && typeof src.key === "string" && src.key ? { kind: "field", key: src.key, ...(src.part ? { part: String(src.part) } : {}) }
              : { kind: "empty" };
      const format = (VALUE_FORMATS as readonly string[]).includes(String(c?.format)) ? (c!.format as ValueFormat) : undefined;
      return { header: String(c?.header ?? ""), source: okSource, ...(format ? { format } : {}) };
    }),
  };
}
