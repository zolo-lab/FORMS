/** List types ("סוגי רשימות"): the database side. Pure rules live in src/lib/fields/list-type.ts. */
import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { cleanTypeFields, displayKeyOf, MAX_TYPE_FIELDS } from "@/lib/fields/list-type";

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

/** Adds a field at the end of a type (e.g. one just created in the dictionary from the type's screen). False when full. */
export async function appendFieldToType(id: string, key: string): Promise<boolean> {
  // Compare-and-set on the row's `updatedAt`, re-read on a clash: two fields added to the same type at once both
  // land, instead of the second write dropping the first.
  for (let attempt = 0; attempt < 5; attempt++) {
    const t = await getListType(id);
    if (!t || t.fields.includes(key)) return true;
    if (t.fields.length >= MAX_TYPE_FIELDS) return false;
    const fields = [...t.fields, key];
    const won = await db
      .update(listTypes)
      .set({ fields, displayKey: displayKeyOf(fields, t.displayKey), updatedAt: new Date() })
      .where(and(eq(listTypes.id, id), eq(listTypes.updatedAt, t.updatedAt)))
      .returning({ id: listTypes.id });
    if (won.length) return true;
  }
  return false;
}

export async function deleteListType(id: string) {
  await db.delete(listTypes).where(eq(listTypes.id, id));
}

/** The types that use a field (by internal name). */
export async function typesUsingKey(key: string): Promise<ListType[]> {
  return orEmpty(db.select().from(listTypes).where(sql`${listTypes.fields} ? ${key}`));
}

/**
 * The update that makes every type listing `from` list `to` instead – one SQL statement that reads each row as it
 * is when it runs (so a type edited a moment before keeps that edit), returned unrun so the caller can put it in
 * one batch with the dictionary's own update.
 */
export function keyRenameInTypes(from: string, to: string) {
  return db
    .update(listTypes)
    .set({
      fields: sql`(SELECT coalesce(jsonb_agg(CASE WHEN e = ${from} THEN ${to} ELSE e END ORDER BY i), '[]'::jsonb) FROM jsonb_array_elements_text(${listTypes.fields}) WITH ORDINALITY AS x(e, i))`,
      displayKey: sql`CASE WHEN ${listTypes.displayKey} = ${from} THEN ${to} ELSE ${listTypes.displayKey} END`,
      updatedAt: new Date(),
    })
    .where(sql`${listTypes.fields} ? ${from} OR ${listTypes.displayKey} = ${from}`);
}
