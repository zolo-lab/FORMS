/** Data stores ("מאגרי נתונים"): the database side. Pure rules live in src/lib/stores/model.ts. */
import { asc, count, eq, inArray, max } from "drizzle-orm";
import { db, schema } from "@/db";
import { cleanRows, columnsProblem, highestKey, MAX_ROWS, normalizeColumns, type StoreColumn, type StoreValues } from "@/lib/stores/model";

const { dataStores, dataStoreRows } = schema;

export type DataStore = typeof dataStores.$inferSelect;
export type DataStoreRow = typeof dataStoreRows.$inferSelect;

/** The table does not exist yet on a database the migration has not reached: show an empty list, not a 500. */
async function orEmpty<T>(q: Promise<T[]>): Promise<T[]> {
  try {
    return await q;
  } catch (e) {
    if ((e as { cause?: { code?: string }; code?: string }).cause?.code === "42P01" || (e as { code?: string }).code === "42P01") return [];
    throw e;
  }
}

export async function listStores(): Promise<(DataStore & { rowCount: number })[]> {
  const stores = await orEmpty(db.select().from(dataStores).orderBy(asc(dataStores.name)));
  if (!stores.length) return [];
  const counts = await db
    .select({ storeId: dataStoreRows.storeId, n: count() })
    .from(dataStoreRows)
    .where(inArray(dataStoreRows.storeId, stores.map((s) => s.id)))
    .groupBy(dataStoreRows.storeId);
  const by = new Map(counts.map((c) => [c.storeId, Number(c.n)]));
  return stores.map((s) => ({ ...s, rowCount: by.get(s.id) ?? 0 }));
}

export async function getStore(id: string): Promise<{ store: DataStore; rows: DataStoreRow[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [store] = await db.select().from(dataStores).where(eq(dataStores.id, id));
  if (!store) return null;
  const rows = await db.select().from(dataStoreRows).where(eq(dataStoreRows.storeId, id)).orderBy(asc(dataStoreRows.order), asc(dataStoreRows.createdAt));
  return { store, rows };
}

/** A new store, with its first columns ("שם ספק, ח"פ, כתובת"). The first column is what the dropdown shows. */
export async function createStore(name: string, columnLabels: string[]): Promise<string> {
  const columns = normalizeColumns(columnLabels.map((label) => ({ label })), []);
  const [row] = await db
    .insert(dataStores)
    .values({ name: name.trim().slice(0, 120), columns, lastColumnNumber: highestKey(columns), displayColumn: columns[0]?.key ?? null })
    .returning({ id: dataStores.id });
  return row!.id;
}

export async function renameStore(id: string, name: string, description: string) {
  await db.update(dataStores).set({ name: name.trim().slice(0, 120), description: description.trim().slice(0, 500) || null, updatedAt: new Date() }).where(eq(dataStores.id, id));
}

/**
 * Saves the columns and the rows in one go (the editor has one save button). Columns keep their keys, so a renamed
 * column keeps its values and the forms that point at it; a removed column's values are dropped from every row.
 * Rows are replaced as sent: rows that kept their id are updated, new ones inserted, missing ones deleted.
 */
export async function saveStore(
  id: string,
  input: { columns: { key?: unknown; label?: unknown }[]; displayColumn?: string | null; displayLabel?: string | null; rows: unknown },
): Promise<{ ok: true } | { ok: false; reason: "notFound" | "columns" | "tooMany"; message?: string }> {
  const [store] = await db.select().from(dataStores).where(eq(dataStores.id, id));
  if (!store) return { ok: false, reason: "notFound" };
  // An empty or repeated name is refused, never silently dropped with its values.
  const problem = columnsProblem(input.columns);
  if (problem) return { ok: false, reason: "columns", message: problem };
  if (Array.isArray(input.rows) && input.rows.length > MAX_ROWS) return { ok: false, reason: "tooMany" };
  const columns = normalizeColumns(input.columns, store.columns, store.lastColumnNumber);
  // A column added in this save has no key yet: the editor names its display column by label then.
  const display = columns.find((c) => c.key === input.displayColumn) ?? columns.find((c) => c.label === (input.displayLabel ?? "").replace(/\s+/g, " ").trim());
  const displayColumn = display?.key ?? columns[0]!.key;
  const rows = cleanRows(input.rows, columns);

  const existing = await db.select({ id: dataStoreRows.id, values: dataStoreRows.values, order: dataStoreRows.order }).from(dataStoreRows).where(eq(dataStoreRows.storeId, id));
  const existingIds = new Set(existing.map((r) => r.id));
  const before = new Map(existing.map((r) => [r.id, r]));
  const keep = new Set(rows.filter((r) => r.id && existingIds.has(r.id)).map((r) => r.id!));
  const now = new Date();
  // No transactions over neon-http: write the store first, then the rows; a failure halfway leaves rows that the
  // next save puts right (the editor still holds everything).
  await db.update(dataStores).set({ columns, displayColumn, lastColumnNumber: highestKey(columns, store.lastColumnNumber), updatedAt: now }).where(eq(dataStores.id, id));
  const gone = [...existingIds].filter((x) => !keep.has(x));
  if (gone.length) await db.delete(dataStoreRows).where(inArray(dataStoreRows.id, gone));
  const writes: Promise<unknown>[] = [];
  const inserts: (typeof dataStoreRows.$inferInsert)[] = [];
  const same = (a: StoreValues, b: StoreValues) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
  rows.forEach((r, order) => {
    if (r.id && keep.has(r.id)) {
      // Only rows that actually changed are written.
      const old = before.get(r.id)!;
      if (old.order !== order || !same(old.values, r.values)) writes.push(db.update(dataStoreRows).set({ values: r.values, order, updatedAt: now }).where(eq(dataStoreRows.id, r.id)));
    } else inserts.push({ storeId: id, values: r.values, order });
  });
  for (let i = 0; i < writes.length; i += 50) await Promise.all(writes.slice(i, i + 50));
  for (let i = 0; i < inserts.length; i += 500) await db.insert(dataStoreRows).values(inserts.slice(i, i + 500));
  return { ok: true };
}

/**
 * Rows from a sheet, added after the existing ones or replacing them all, up to MAX_ROWS in the store. Returns how
 * many were written. On replace, the new rows are written first and the old ones deleted after (no transactions
 * over neon-http: a failure halfway leaves extra rows, never an empty store).
 */
export async function importRows(id: string, rows: StoreValues[], mode: "append" | "replace"): Promise<number> {
  const old = await db.select({ id: dataStoreRows.id }).from(dataStoreRows).where(eq(dataStoreRows.storeId, id));
  const [{ top } = { top: null }] = await db.select({ top: max(dataStoreRows.order) }).from(dataStoreRows).where(eq(dataStoreRows.storeId, id));
  const room = mode === "replace" ? MAX_ROWS : Math.max(0, MAX_ROWS - old.length);
  const start = mode === "replace" ? 0 : (top ?? -1) + 1;
  const values = rows.slice(0, room).map((v, i) => ({ storeId: id, values: v, order: start + i }));
  for (let i = 0; i < values.length; i += 500) await db.insert(dataStoreRows).values(values.slice(i, i + 500));
  if (mode === "replace" && old.length) await db.delete(dataStoreRows).where(inArray(dataStoreRows.id, old.map((r) => r.id)));
  // The editor remounts when the store changes: touching it makes the page show the imported rows.
  await db.update(dataStores).set({ updatedAt: new Date() }).where(eq(dataStores.id, id));
  return values.length;
}

/** Adds columns (e.g. headers of an imported sheet that matched none) and returns the store's columns. */
export async function addColumns(id: string, labels: string[]): Promise<StoreColumn[]> {
  const [store] = await db.select().from(dataStores).where(eq(dataStores.id, id));
  if (!store) return [];
  const columns = normalizeColumns([...store.columns, ...labels.map((label) => ({ label }))], store.columns, store.lastColumnNumber);
  await db.update(dataStores).set({ columns, lastColumnNumber: highestKey(columns, store.lastColumnNumber), updatedAt: new Date() }).where(eq(dataStores.id, id));
  return columns;
}

export async function deleteStore(id: string) {
  await db.delete(dataStores).where(eq(dataStores.id, id));
}
