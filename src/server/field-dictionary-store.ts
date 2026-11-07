/**
 * The central dictionary of identifying fields ("שדות מזהים"): the organizations' own fields and the general ones
 * (supplier name, company number…) in one list. The two live in two tables but share one namespace of internal
 * names. Lists of suppliers, work places… are built on these fields.
 */
import { asc, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { normalizeFieldKey, suggestKey } from "@/lib/fields/key";
import { dictionaryType, type DictionaryType } from "@/lib/fields/types";
import { createOrgFieldDef, listOrgFieldDefs, renameOrgFieldDef, takenFieldKeys, updateOrgFieldDef } from "./orgs-store";

const { fieldDictionary } = schema;

export type FieldCategory = "org" | "general";

export interface DictionaryEntry {
  id: string;
  key: string;
  label: string;
  type: DictionaryType;
  category: FieldCategory;
}

/** The table does not exist yet on a database the migration has not reached: an empty list, not a 500. */
async function generalRows() {
  try {
    return await db.select().from(fieldDictionary).orderBy(asc(fieldDictionary.order), asc(fieldDictionary.label));
  } catch (e) {
    const code = (e as { cause?: { code?: string }; code?: string }).cause?.code ?? (e as { code?: string }).code;
    if (code === "42P01") return [];
    throw e;
  }
}

/** Every identifying field: the organizations' first, then the general ones. */
export async function listDictionary(): Promise<DictionaryEntry[]> {
  const [orgs, general] = await Promise.all([listOrgFieldDefs(), generalRows()]);
  return [
    ...orgs.map((d) => ({ id: d.id, key: d.key, label: d.label, type: dictionaryType(d.type, true), category: "org" as const })),
    ...general.map((d) => ({ id: d.id, key: d.key, label: d.label, type: dictionaryType(d.type), category: "general" as const })),
  ];
}

export type DictionaryResult = { ok: true; key: string } | { ok: false; reason: "label" | "key" | "exists" | "missing" };

/** A new field: the Hebrew name, a type, and an internal name (made from the name unless typed). */
export async function createDictionaryEntry(input: { label: string; key?: string; type?: string; category: FieldCategory }): Promise<DictionaryResult> {
  if (input.category === "org") return createOrgFieldDef(input);
  const label = input.label.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!label) return { ok: false, reason: "label" };
  const taken = await takenFieldKeys();
  let key: string;
  if (input.key?.trim()) {
    const typed = normalizeFieldKey(input.key);
    if (!typed) return { ok: false, reason: "key" };
    if ([...taken].some((k) => k.toLowerCase() === typed.toLowerCase())) return { ok: false, reason: "exists" };
    key = typed;
  } else key = suggestKey(label, taken);
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(fieldDictionary);
  await db.insert(fieldDictionary).values({ key, label, type: dictionaryType(input.type), order: Number(n) });
  return { ok: true, key };
}

/**
 * Name, type and internal name of a field. An organization field's internal name is renamed together with every
 * form and value that points at it; a general field is not used by forms yet, so it is simply renamed.
 */
export async function updateDictionaryEntry(id: string, category: FieldCategory, patch: { label: string; type: string; key: string }): Promise<DictionaryResult> {
  const label = patch.label.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!label) return { ok: false, reason: "label" };
  if (category === "org") {
    const defs = await listOrgFieldDefs();
    const cur = defs.find((d) => d.id === id);
    if (!cur) return { ok: false, reason: "missing" };
    if (patch.key.trim() && patch.key.trim() !== cur.key) {
      const r = await renameOrgFieldDef(id, patch.key);
      if (!r.ok) return r;
    }
    await updateOrgFieldDef(id, { label, type: patch.type });
    return { ok: true, key: patch.key.trim() || cur.key };
  }
  const [cur] = await db.select().from(fieldDictionary).where(eq(fieldDictionary.id, id));
  if (!cur) return { ok: false, reason: "missing" };
  let key = cur.key;
  if (patch.key.trim() && patch.key.trim() !== cur.key) {
    const typed = normalizeFieldKey(patch.key);
    if (!typed) return { ok: false, reason: "key" };
    const taken = await takenFieldKeys();
    taken.delete(cur.key);
    if ([...taken].some((k) => k.toLowerCase() === typed.toLowerCase())) return { ok: false, reason: "exists" };
    key = typed;
  }
  await db.update(fieldDictionary).set({ key, label, type: dictionaryType(patch.type), updatedAt: new Date() }).where(eq(fieldDictionary.id, id));
  return { ok: true, key };
}

export async function deleteDictionaryEntry(id: string) {
  await db.delete(fieldDictionary).where(eq(fieldDictionary.id, id));
}
