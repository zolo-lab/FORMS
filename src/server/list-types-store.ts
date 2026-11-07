/** List types ("סוגי רשימות"): the database side. Pure rules live in src/lib/fields/list-type.ts. */
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { cleanTypeFields, displayKeyOf, MAX_TYPE_FIELDS, renameKeyInType } from "@/lib/fields/list-type";

const { listTypes } = schema;

export type ListType = typeof listTypes.$inferSelect;

/** A database the migration has not reached yet: an empty list, not a 500. */
async function orEmpty<T>(q: Promise<T[]>): Promise<T[]> {
  try {
    return await q;
  } catch (e) {
    const code = (e as { cause?: { code?: string }; code?: string }).cause?.code ?? (e as { code?: string }).code;
    if (code === "42P01") return [];
    throw e;
  }
}

export async function listListTypes(): Promise<ListType[]> {
  return orEmpty(db.select().from(listTypes).orderBy(asc(listTypes.name)));
}

export async function getListType(id: string): Promise<ListType | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [t] = await db.select().from(listTypes).where(eq(listTypes.id, id));
  return t ?? null;
}

export async function createListType(name: string): Promise<string | null> {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!clean) return null;
  const [row] = await db.insert(listTypes).values({ name: clean }).returning({ id: listTypes.id });
  return row!.id;
}

/** Name, fields (internal names of `known` only, in order) and the field that names a record. */
export async function saveListType(id: string, input: { name: string; fields: unknown; displayKey: string | null }, known: string[]): Promise<boolean> {
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!name) return false;
  const fields = cleanTypeFields(input.fields, known);
  await db.update(listTypes).set({ name, fields, displayKey: displayKeyOf(fields, input.displayKey), updatedAt: new Date() }).where(eq(listTypes.id, id));
  return true;
}

/** Adds a field at the end of a type (e.g. one just created in the dictionary from the type's screen). */
export async function appendFieldToType(id: string, key: string): Promise<boolean> {
  const t = await getListType(id);
  if (!t || t.fields.includes(key)) return true;
  if (t.fields.length >= MAX_TYPE_FIELDS) return false;
  const fields = [...t.fields, key];
  await db.update(listTypes).set({ fields, displayKey: displayKeyOf(fields, t.displayKey), updatedAt: new Date() }).where(eq(listTypes.id, id));
  return true;
}

export async function deleteListType(id: string) {
  await db.delete(listTypes).where(eq(listTypes.id, id));
}

/** The types that use a field (by internal name). */
export async function typesUsingKey(key: string): Promise<ListType[]> {
  return orEmpty(db.select().from(listTypes).where(sql`${listTypes.fields} ? ${key}`));
}

/**
 * The updates that make every type listing `from` list `to` instead – not run here, so the caller can run them in
 * one batch with the dictionary's own update.
 */
export async function keyRenameInTypes(from: string, to: string) {
  const now = new Date();
  return (await typesUsingKey(from)).flatMap((t) => {
    const next = renameKeyInType(t, from, to);
    return next ? [db.update(listTypes).set({ ...next, updatedAt: now }).where(eq(listTypes.id, t.id))] : [];
  });
}
