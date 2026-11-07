/** Runs against the dev database; skipped when DATABASE_URL is not set. */
import { afterAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("list types (dev DB)", () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => {});
  });

  it("a type lists dictionary fields; a renamed field follows; a field in use cannot be deleted", async () => {
    const { db, schema } = await import("@/db");
    const { eq, inArray } = await import("drizzle-orm");
    const dict = await import("@/server/field-dictionary-store");
    const types = await import("@/server/list-types-store");
    const stamp = Date.now().toString(36);

    const a = await dict.createDictionaryEntry({ label: `שם ספק ${stamp}`, key: `supName${stamp}`, category: "general" });
    const b = await dict.createDictionaryEntry({ label: `ח"פ ${stamp}`, key: `supNum${stamp}`, category: "general" });
    expect(a.ok && b.ok).toBe(true);
    const keys = [`supName${stamp}`, `supNum${stamp}`, `renamed${stamp}`];
    cleanup.push(() => db.delete(schema.fieldDictionary).where(inArray(schema.fieldDictionary.key, keys)));

    const id = (await types.createListType(`ספקים ${stamp}`))!;
    cleanup.push(() => db.delete(schema.listTypes).where(eq(schema.listTypes.id, id)));
    const known = (await dict.listDictionary()).filter((f) => f.category === "general").map((f) => f.key);
    expect(await types.saveListType(id, { name: `ספקים ${stamp}`, fields: [`supNum${stamp}`, `supName${stamp}`, "nope"], displayKey: `supName${stamp}` }, known)).toBe(true);
    let t = (await types.getListType(id))!;
    expect(t.fields).toEqual([`supNum${stamp}`, `supName${stamp}`]);
    expect(t.displayKey).toBe(`supName${stamp}`);

    const entry = (await dict.listDictionary()).find((f) => f.key === `supName${stamp}`)!;
    expect(await dict.updateDictionaryEntry(entry.id, "general", { label: entry.label, type: "", key: `renamed${stamp}` })).toEqual({ ok: true, key: `renamed${stamp}` });
    t = (await types.getListType(id))!;
    expect(t.fields).toEqual([`supNum${stamp}`, `renamed${stamp}`]);
    expect(t.displayKey).toBe(`renamed${stamp}`);

    const del = await dict.deleteDictionaryEntry(entry.id);
    expect(del).toMatchObject({ ok: false, reason: "inUse" });
  });
});
