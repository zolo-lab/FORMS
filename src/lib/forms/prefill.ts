/** Initial values for fields with `prefill`, taken from the request's subject (the employee the request is about). */
import type { Answers } from "./conditions";
import { renameFieldId, updateField } from "./builder";
import { allFields, type FormDefinition, type FormField } from "./schema";

export interface PrefillSubject {
  name: string;
  /** The organization of the request (from its link, or chosen when the request was opened). */
  org?: { name: string; registrationNumber?: string | null; fields?: Record<string, string> | null } | null;
  idNumber?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** Data a field can be pre-filled from (the request's employee). Shown as a list in the builder. */
export const PREFILL_KEYS = [
  { key: "employee.name", label: "שם מלא של העובד" },
  { key: "employee.firstName", label: "שם פרטי של העובד" },
  { key: "employee.lastName", label: "שם משפחה של העובד" },
  { key: "employee.idNumber", label: "מספר זהות של העובד" },
  { key: "employee.email", label: "מייל של העובד" },
  { key: "employee.phone", label: "טלפון של העובד" },
  { key: "org.name", label: "שם העמותה (לפי הקישור)" },
  { key: "org.registrationNumber", label: "ח\"פ / מספר העמותה" },
] as const;

/** The prefix of the organizations’ own fields, defined by an admin: `org.fields.<key>`. */
export const ORG_FIELD_PREFIX = "org.fields.";

/** The key of an organization field, or undefined when this is not one. */
export const orgFieldKey = (prefill: string | undefined): string | undefined =>
  prefill?.startsWith(ORG_FIELD_PREFIX) ? prefill.slice(ORG_FIELD_PREFIX.length) : undefined;

/**
 * Field types whose answer is not a plain string (a name, a bank account and an address are objects; a grid or a
 * table is a structure of its own). An organization’s value is one line of text, so it is not offered for them.
 */
const COMPOSITE_TYPES = new Set(["full_name", "address", "bank_account", "radio_grid", "checkbox_grid", "repeating_table", "group", "file_upload", "signature"]);

/** May a field of this type be filled from an organization field (one line of text)? */
export const takesOrgField = (type: string) => !COMPOSITE_TYPES.has(type);

/**
 * The prefill list a builder shows: the fixed keys, plus the organizations’ own fields for the field types whose
 * answer is a plain line of text.
 */
export function prefillKeys(orgFields: { key: string; label: string }[] = [], type?: string): { key: string; label: string }[] {
  if (type !== undefined && !takesOrgField(type)) return [...PREFILL_KEYS];
  return [...PREFILL_KEYS, ...orgFields.map((f) => ({ key: `${ORG_FIELD_PREFIX}${f.key}`, label: `${f.label} (שדה של העמותה)` }))];
}

/**
 * "שם מזהה" chosen from the fields defined in the organizations: the field is named after one (a dash becomes "_",
 * as field ids take none; a number is added when another field of the form already has that name) and is filled
 * from it, with the value of the request's organization.
 */
export function linkToOrgField(def: FormDefinition, fieldId: string, orgKey: string): { def?: FormDefinition; id?: string; error?: string } {
  const field = allFields(def).find((f) => f.id === fieldId);
  if (!field) return { error: "השדה לא נמצא" };
  if (!takesOrgField(field.type)) return { error: "שדה מהסוג הזה לא מתמלא משדה של העמותה (ערך של שורה אחת)" };
  const base = orgKey.replace(/-/g, "_");
  const taken = new Set(allFields(def).map((f) => f.id).filter((id) => id !== fieldId));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}${n}`;
  const renamed = renameFieldId(def, fieldId, id);
  if (renamed.error) return { error: renamed.error };
  return { def: updateField(renamed.def, id, { prefill: `${ORG_FIELD_PREFIX}${orgKey}` }), id };
}

/** The same list split in two, for a picker that shows the organizations’ own fields as a group of their own. */
export function prefillGroups(orgFields: { key: string; label: string }[] = [], type?: string) {
  const offered = type !== undefined && !takesOrgField(type) ? [] : orgFields;
  return [
    { label: "נתוני העובד והבקשה", options: [...PREFILL_KEYS] },
    { label: "שדות שהוגדרו בעמותות", options: offered.map((f) => ({ key: `${ORG_FIELD_PREFIX}${f.key}`, label: f.label })) },
  ].filter((g) => g.options.length > 0);
}

/**
 * Fields with these ids are the organization's fields: they fill themselves from the request's organization (as if
 * their prefill were set) and nobody types them.
 */
export const ORG_FIELD_IDS: Record<string, "org.name" | "org.registrationNumber"> = { org_name: "org.name", org_number: "org.registrationNumber" };

/** The prefill of a field: its own setting, or the organization's for the fixed ids (org_name, org_number). */
export const prefillOf = (f: { id: string; prefill?: string }): string | undefined => f.prefill ?? (Object.hasOwn(ORG_FIELD_IDS, f.id) ? ORG_FIELD_IDS[f.id] : undefined);

/** Filled by the system from the request's organization: shown read-only, and the server sets the value. */
export const isOrgField = (f: { id: string; prefill?: string }) => !!prefillOf(f)?.startsWith("org.");

/** Splits "ישראל בן דוד" into first "ישראל" and last "בן דוד". */
function splitName(name: string): { first: string; last: string } {
  const [first = "", ...rest] = name.trim().split(/\s+/);
  return { first, last: rest.join(" ") };
}

function valueFor(key: string, type: string, s: PrefillSubject): unknown {
  switch (key) {
    case "employee.name":
      return type === "full_name" ? splitName(s.name) : s.name.trim() || undefined;
    case "employee.firstName":
      return splitName(s.name).first || undefined;
    case "employee.lastName":
      return splitName(s.name).last || undefined;
    case "employee.idNumber":
      return s.idNumber?.trim() || undefined;
    case "employee.email":
      return s.email?.trim() || undefined;
    case "employee.phone":
      return s.phone?.trim() || undefined;
    case "org.name":
      return s.org?.name.trim() || undefined;
    case "org.registrationNumber":
      return s.org?.registrationNumber?.trim() || undefined;
    default: {
      // The organizations' own fields: the value this organization filled in, if any.
      const k = orgFieldKey(key);
      return k ? s.org?.fields?.[k]?.trim() || undefined : undefined;
    }
  }
}

/** Stored answers win; a prefill only fills fields that have no answer yet. */
export function withPrefill(def: FormDefinition, subject: PrefillSubject, answers: Answers): Answers {
  const out: Answers = { ...answers };
  for (const f of allFields(def)) {
    const key = prefillOf(f);
    if (!key || out[f.id] !== undefined) continue;
    const v = valueFor(key, f.type, subject);
    if (v !== undefined) out[f.id] = v as Answers[string];
  }
  return out;
}

/** The organization's fields always carry the request's organization, whatever was sent (they are not typed). */
export function withOrgFields(def: FormDefinition, org: PrefillSubject["org"], answers: Answers): Answers {
  if (!org) return answers;
  const out: Answers = { ...answers };
  for (const f of allFields(def)) {
    const key = prefillOf(f);
    if (!key?.startsWith("org.")) continue;
    const v = valueFor(key, f.type, { name: "", org });
    if (v === undefined) delete out[f.id];
    else out[f.id] = v as Answers[string];
  }
  return out;
}

/** The organization's fields shown read-only (the system fills them; see `withOrgFields`). */
export function lockOrgFields(def: FormDefinition): FormDefinition {
  const lock = (f: FormField): FormField => ({ ...(isOrgField(f) ? { ...f, readOnly: true } : f), ...(f.fields ? { fields: f.fields.map(lock) } : {}) });
  return { ...def, pages: def.pages.map((p) => ({ ...p, fields: p.fields.map(lock) })) };
}
