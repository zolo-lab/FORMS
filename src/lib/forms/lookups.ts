import { BANK_LIST } from "./bank-branches";
import type { FieldOption } from "./schema";

/**
 * Static option lists used until phase 3 syncs real tables from data.gov.il.
 * `optionsSource` keys map here; unknown keys resolve to an empty list.
 */
/** Banks from the Bank of Israel list (bank-branches.ts). */
export const BANKS: FieldOption[] = BANK_LIST;

export type Lookups = Record<string, FieldOption[]>;

export const STATIC_LOOKUPS: Lookups = { banks: BANKS };

export function resolveOptions(
  field: { options?: FieldOption[]; optionsSource?: string },
  lookups: Lookups = STATIC_LOOKUPS,
): FieldOption[] {
  // A choice linked to the organizations' list carries a copy of all its options: shown where no organization is
  // known (the builder's preview); with an organization the server narrows them (see linked.ts).
  if (field.optionsSource) return lookups[field.optionsSource] ?? (field.optionsSource.startsWith("org.fields.") ? field.options : undefined) ?? [];
  return field.options ?? [];
}
