import type { FieldOption } from "./schema";

/**
 * Static option lists used until phase 3 syncs real tables from data.gov.il.
 * `optionsSource` keys map here; unknown keys resolve to an empty list.
 */
export const BANKS: FieldOption[] = [
  ["04", "יהב"], ["09", "בנק הדואר"], ["10", "לאומי"], ["11", "דיסקונט"], ["12", "הפועלים"],
  ["13", "איגוד"], ["14", "אוצר החייל"], ["17", "מרכנתיל דיסקונט"], ["20", "מזרחי טפחות"],
  ["22", "סיטיבנק"], ["23", "HSBC"], ["26", "יובנק"], ["31", "הבינלאומי"], ["34", "הבנק הערבי הישראלי"],
  ["46", "מסד"], ["52", "פאגי"], ["54", "ירושלים"],
].map(([value, name]) => ({ value: value!, label: `${name} (${value})` }));

export type Lookups = Record<string, FieldOption[]>;

export const STATIC_LOOKUPS: Lookups = { banks: BANKS };

export function resolveOptions(
  field: { options?: FieldOption[]; optionsSource?: string },
  lookups: Lookups = STATIC_LOOKUPS,
): FieldOption[] {
  if (field.optionsSource) return lookups[field.optionsSource] ?? [];
  return field.options ?? [];
}
