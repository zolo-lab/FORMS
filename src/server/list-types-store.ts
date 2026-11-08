/** List types ("סוגי רשימות"): the database side. Pure rules live in src/lib/fields/list-type.ts. */
import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { cleanTypeFields, displayKeyOf } from "@/lib/fields/list-type";

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

/** Deletes a type, unless it still has records (deleting it would delete every supplier in it). */
export async function deleteListType(id: string): Promise<{ ok: true } | { ok: false; records: number }> {
  const gone = await db
    .delete(listTypes)
    .where(and(eq(listTypes.id, id), sql`NOT EXISTS (SELECT 1 FROM ${schema.listRecords} WHERE ${schema.listRecords.listTypeId} = ${id})`))
    .returning({ id: listTypes.id });
  if (gone.length) return { ok: true };
  return { ok: false, records: (await listRecordsOf(id)).length };
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

// ───────────────────────── Records (one supplier, one work place…) ─────────────────────────

const { listRecords } = schema;
export type ListRecord = typeof listRecords.$inferSelect;

export async function listRecordsOf(typeId: string): Promise<ListRecord[]> {
  if (!/^[0-9a-f-]{36}$/i.test(typeId)) return [];
  return orEmpty(db.select().from(listRecords).where(eq(listRecords.listTypeId, typeId)).orderBy(asc(listRecords.createdAt)));
}

export async function recordCount(typeId: string): Promise<number> {
  const [row] = await orEmpty(db.select({ n: sql<number>`count(*)::int` }).from(listRecords).where(eq(listRecords.listTypeId, typeId)));
  return row?.n ?? 0;
}

export async function recordCounts(): Promise<Map<string, number>> {
  const rows = await orEmpty(db.select({ id: listRecords.listTypeId, n: sql<number>`count(*)::int` }).from(listRecords).groupBy(listRecords.listTypeId));
  return new Map(rows.map((r) => [r.id, r.n]));
}

/**
 * Adds or updates a record. On update, `fields` are the type's current fields: their values are replaced by `values`
 * (a cleared field is dropped), while values of fields since taken off the type stay, so adding the field back
 * brings them back. Returns null when the record is gone (deleted meanwhile, or of another type), or the type's fields are no longer
 * `typeFieldsRead`.
 */
export async function saveRecord(typeId: string, id: string | null, values: Record<string, string>, fields: string[] = Object.keys(values), typeFieldsRead?: string[]): Promise<string | null> {
  if (id) {
    const rows = await db
      .update(listRecords)
      .set({ values: sql`(${listRecords.values} - ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(fields)}::jsonb))) || ${JSON.stringify(values)}::jsonb`, updatedAt: new Date() })
      .where(
        and(
          eq(listRecords.id, id),
          eq(listRecords.listTypeId, typeId),
          // The type's fields as the caller read them: a field renamed or removed meanwhile makes the save miss.
          typeFieldsRead ? sql`EXISTS (SELECT 1 FROM ${listTypes} WHERE ${listTypes.id} = ${typeId} AND ${listTypes.fields} = ${JSON.stringify(typeFieldsRead)}::jsonb)` : undefined,
        ),
      )
      .returning({ id: listRecords.id });
    return rows.length ? id : null;
  }
  const [row] = await db.insert(listRecords).values({ listTypeId: typeId, values }).returning({ id: listRecords.id });
  return row!.id;
}

export async function deleteRecord(typeId: string, id: string) {
  await db.delete(listRecords).where(and(eq(listRecords.id, id), eq(listRecords.listTypeId, typeId)));
}

/** A field's internal name changed: its value moves to the new name in every record (run in the same batch). */
export function keyRenameInRecords(from: string, to: string) {
  return db
    .update(listRecords)
    .set({ values: sql`(${listRecords.values} - ${from}) || jsonb_build_object(${to}::text, ${listRecords.values} -> ${from})` })
    .where(sql`${listRecords.values} ? ${from}`);
}
