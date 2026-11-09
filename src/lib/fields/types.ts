/** The field types an identifying field can have, and which of them an organization field may use. */
import type { FieldType } from "@/lib/forms/field-types";

export const DICTIONARY_TYPES = [
  "short_text",
  "long_text",
  "number",
  "currency",
  "percent",
  "id_number",
  "phone",
  "email",
  "date",
  "bank_account",
  "address",
  "full_name",
] as const satisfies readonly FieldType[];
export type DictionaryType = (typeof DICTIONARY_TYPES)[number];

/** An organization's value is one line of text, so its fields take only the single-line types. */
export const ORG_FIELD_TYPES = ["short_text", "number", "currency", "percent", "id_number", "phone", "email", "date"] as const satisfies readonly DictionaryType[];

export const DICTIONARY_TYPE_LABELS: Record<DictionaryType, string> = {
  short_text: "טקסט",
  long_text: "טקסט ארוך",
  number: "מספר",
  currency: "סכום",
  percent: "אחוז",
  id_number: "תעודת זהות",
  phone: "טלפון",
  email: "מייל",
  date: "תאריך",
  bank_account: "חשבון בנק",
  address: "כתובת",
  full_name: "שם מלא",
};

export const isOrgFieldType = (type: string) => (ORG_FIELD_TYPES as readonly string[]).includes(type);

/** An organization field can also be a choice of one option (on the lists screen); its value is still one line. */
export const isOrgFieldKind = (type: string) => type === "select" || isOrgFieldType(type);

export function dictionaryType(raw: unknown, forOrg = false): DictionaryType {
  const list: readonly string[] = forOrg ? ORG_FIELD_TYPES : DICTIONARY_TYPES;
  return typeof raw === "string" && list.includes(raw) ? (raw as DictionaryType) : "short_text";
}
