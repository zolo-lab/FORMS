/**
 * Data stores ("מאגרי נתונים"): tables an admin builds – columns of their own and rows – that a form's dropdown lists
 * and whose chosen row fills other fields, the way an organization's fields fill from the request's organization.
 * Pure helpers, unit tested; the database side is src/server/stores-store.ts.
 */

export interface StoreColumn {
  /** Stable id the forms point at ("c1", "c2"…). Never reused, so renaming a column never breaks a form. */
  key: string;
  label: string;
}

export type StoreValues = Record<string, string>;

export const MAX_COLUMNS = 30;
export const MAX_ROWS = 2000;
export const MAX_VALUE = 500;
export const MAX_LABEL = 80;

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** The next unused key ("c" + a number higher than any key seen so far, including deleted ones). */
export function nextColumnKey(columns: StoreColumn[], highest = 0): string {
  const top = columns.reduce((m, c) => Math.max(m, Number(/^c(\d+)$/.exec(c.key)?.[1] ?? 0)), highest);
  return `c${top + 1}`;
}

/**
 * Columns as typed in the editor: labels trimmed, empty ones dropped, duplicates (same label) dropped, keys kept
 * for existing columns and minted for new ones (a column whose key is missing or unknown is new).
 */
export function normalizeColumns(input: { key?: unknown; label?: unknown }[], existing: StoreColumn[], highest = 0): StoreColumn[] {
  const known = new Set(existing.map((c) => c.key));
  const out: StoreColumn[] = [];
  const seen = new Set<string>();
  let top = highest;
  for (const raw of input) {
    const label = clean(raw.label, MAX_LABEL);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    let key = typeof raw.key === "string" && known.has(raw.key) && !out.some((c) => c.key === raw.key) ? raw.key : "";
    if (!key) {
      key = nextColumnKey([...existing, ...out], top);
      top = Number(key.slice(1));
    }
    out.push({ key, label });
    if (out.length >= MAX_COLUMNS) break;
  }
  return out;
}

/**
 * Why the editor's columns cannot be saved as they are, or null: an empty or repeated name would silently drop a
 * column (and its values), so it is refused instead.
 */
export function columnsProblem(input: { label?: unknown }[]): string | null {
  const labels = input.map((c) => clean(c.label, MAX_LABEL));
  if (!labels.length) return "צריך לפחות עמודה אחת";
  if (labels.some((l) => !l)) return "לכל עמודה צריך שם";
  const dup = labels.find((l, i) => labels.indexOf(l) !== i);
  if (dup) return `שתי עמודות באותו שם: ${dup}`;
  if (labels.length > MAX_COLUMNS) return `עד ${MAX_COLUMNS} עמודות`;
  return null;
}

/** The highest column number a store has ever used, so a deleted column's key is never given to a new one. */
export const highestKey = (columns: StoreColumn[], previous = 0) => Math.max(previous, ...columns.map((c) => Number(/^c(\d+)$/.exec(c.key)?.[1] ?? 0)));

/** One row's values: only known columns, trimmed, empty dropped. */
export function cleanValues(values: unknown, columns: StoreColumn[]): StoreValues {
  const o = values && typeof values === "object" ? (values as Record<string, unknown>) : {};
  const out: StoreValues = {};
  for (const c of columns) {
    const v = clean(o[c.key], MAX_VALUE);
    if (v) out[c.key] = v;
  }
  return out;
}

/** Rows as saved from the editor: cleaned, fully empty rows dropped, capped. */
export function cleanRows(rows: unknown, columns: StoreColumn[]): { id?: string; values: StoreValues }[] {
  if (!Array.isArray(rows)) return [];
  const out: { id?: string; values: StoreValues }[] = [];
  for (const r of rows) {
    const o = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
    const values = cleanValues(o.values, columns);
    if (!Object.keys(values).length) continue;
    const id = typeof o.id === "string" && /^[0-9a-f-]{36}$/i.test(o.id) ? o.id : undefined;
    out.push({ ...(id ? { id } : {}), values });
    if (out.length >= MAX_ROWS) break;
  }
  return out;
}

/** The text shown for a row in a dropdown: its display column, else its first non-empty value. */
export function rowLabel(values: StoreValues, columns: StoreColumn[], displayKey: string | null | undefined): string {
  const shown = displayKey ? values[displayKey] : undefined;
  return shown || columns.map((c) => values[c.key]).find((v) => !!v) || "";
}

const norm = (s: string) => s.replace(/["'״׳]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

export interface ImportPlan {
  /** Column key → sheet column index. */
  mapping: Record<string, number>;
  /** Sheet headers that match no column (offered to add as new columns). */
  unknownHeaders: string[];
  rows: StoreValues[];
}

/**
 * A sheet (first row = headers) read against the store's columns: headers match column labels (ignoring quotes,
 * spaces and case). Rows with no value in any matched column are dropped.
 */
export function planImport(sheet: string[][], columns: StoreColumn[]): ImportPlan {
  const [header = [], ...body] = sheet;
  const mapping: Record<string, number> = {};
  const unknownHeaders: string[] = [];
  header.forEach((h, i) => {
    const label = clean(h, MAX_LABEL);
    if (!label) return;
    const col = columns.find((c) => norm(c.label) === norm(label) && !(c.key in mapping));
    if (col) mapping[col.key] = i;
    else unknownHeaders.push(label);
  });
  const rows: StoreValues[] = [];
  for (const line of body) {
    const values: StoreValues = {};
    for (const [key, i] of Object.entries(mapping)) {
      const v = clean(line[i], MAX_VALUE);
      if (v) values[key] = v;
    }
    if (Object.keys(values).length) rows.push(values);
    if (rows.length >= MAX_ROWS) break;
  }
  return { mapping, unknownHeaders, rows };
}

/** The store as a sheet: one header row of labels, then a row per record. */
export function exportRows(columns: StoreColumn[], rows: { values: StoreValues }[]): string[][] {
  return [columns.map((c) => c.label), ...rows.map((r) => columns.map((c) => r.values[c.key] ?? ""))];
}
