/**
 * A list type ("סוג רשימה"): which identifying fields a kind of list has (suppliers: name, company number, bank…),
 * in order, and which of them names a record when one is picked. Pure, unit tested.
 */

export const MAX_TYPE_FIELDS = 40;

/** The type's fields as sent by the editor: known internal names only, each once, in the order given. */
export function cleanTypeFields(keys: unknown, known: Iterable<string>): string[] {
  const ok = new Set(known);
  if (!Array.isArray(keys)) return [];
  const out: string[] = [];
  for (const k of keys) if (typeof k === "string" && ok.has(k) && !out.includes(k)) out.push(k);
  return out.slice(0, MAX_TYPE_FIELDS);
}

/** The field that names a record: the chosen one when it is still in the type, else the first field. */
export const displayKeyOf = (fields: string[], chosen: string | null | undefined): string | null => (chosen && fields.includes(chosen) ? chosen : (fields[0] ?? null));

/** A field's internal name changed: the type follows (order kept). Returns null when nothing changed. */
export function renameKeyInType(type: { fields: string[]; displayKey: string | null }, from: string, to: string): { fields: string[]; displayKey: string | null } | null {
  if (!type.fields.includes(from) && type.displayKey !== from) return null;
  return { fields: type.fields.map((k) => (k === from ? to : k)), displayKey: type.displayKey === from ? to : type.displayKey };
}
