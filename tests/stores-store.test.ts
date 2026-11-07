/** Runs against the dev database; skipped when DATABASE_URL is not set. */
import { afterAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("stores-store (dev DB)", () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => {});
  });

  it("create → save rows → rename and drop a column → import append and replace", async () => {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const store = await import("@/server/stores-store");

    const id = await store.createStore(`test-store-${Date.now()}`, ["שם ספק", 'ח"פ', "כתובת"]);
    cleanup.push(() => db.delete(schema.dataStores).where(eq(schema.dataStores.id, id)));
    let data = (await store.getStore(id))!;
    expect(data.store.columns.map((c) => c.key)).toEqual(["c1", "c2", "c3"]);
    expect(data.store.displayColumn).toBe("c1");

    const cols = data.store.columns;
    expect(await store.saveStore(id, { columns: cols, displayColumn: "c1", rows: [{ values: { c1: "ספק א", c2: "511" } }, { values: { c1: "ספק ב", c3: "הרצל 1" } }, { values: {} }] })).toEqual({ ok: true });
    data = (await store.getStore(id))!;
    expect(data.rows.map((r) => r.values)).toEqual([{ c1: "ספק א", c2: "511" }, { c1: "ספק ב", c3: "הרצל 1" }]);

    // Rename c1, drop c3, add a column; keep the first row by id, drop the second.
    const keepId = data.rows[0]!.id;
    await store.saveStore(id, {
      columns: [{ key: "c1", label: "שם" }, { key: "c2", label: 'ח"פ' }, { label: "טלפון" }],
      displayColumn: "c1",
      rows: [{ id: keepId, values: { c1: "ספק א", c2: "511", c3: "נמחק" } }],
    });
    data = (await store.getStore(id))!;
    expect(data.store.columns).toEqual([{ key: "c1", label: "שם" }, { key: "c2", label: 'ח"פ' }, { key: "c4", label: "טלפון" }]);
    expect(data.store.lastColumnNumber).toBe(4);
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]!.id).toBe(keepId);
    expect(data.rows[0]!.values).toEqual({ c1: "ספק א", c2: "511" });

    expect(await store.importRows(id, [{ c1: "ספק ג" }, { c1: "ספק ד", c4: "050" }], "append")).toBe(2);
    data = (await store.getStore(id))!;
    expect(data.rows.map((r) => r.values.c1)).toEqual(["ספק א", "ספק ג", "ספק ד"]);

    await store.importRows(id, [{ c1: "רק זה" }], "replace");
    data = (await store.getStore(id))!;
    expect(data.rows.map((r) => r.values)).toEqual([{ c1: "רק זה" }]);

    const listed = (await store.listStores()).find((s) => s.id === id);
    expect(listed?.rowCount).toBe(1);

    await store.deleteStore(id);
    expect(await store.getStore(id)).toBeNull();
    expect(await db.select().from(schema.dataStoreRows).where(eq(schema.dataStoreRows.storeId, id))).toEqual([]);
  });
});
