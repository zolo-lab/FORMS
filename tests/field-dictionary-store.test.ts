/** Runs against the dev database; skipped when DATABASE_URL is not set. */
import { afterAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("field dictionary (dev DB)", () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => {});
  });

  it("general and organization fields share one namespace; the internal name comes from the Hebrew name", async () => {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const dict = await import("@/server/field-dictionary-store");
    const stamp = Date.now().toString(36);

    const g = await dict.createDictionaryEntry({ label: `סוג לינה ${stamp}`, type: "short_text", category: "general" });
    expect(g.ok).toBe(true);
    const gKey = (g as { key: string }).key;
    cleanup.push(() => db.delete(schema.fieldDictionary).where(eq(schema.fieldDictionary.key, gKey)));
    expect(gKey).toMatch(/^svgLynh/);

    // The same internal name cannot be taken again, in either table.
    expect(await dict.createDictionaryEntry({ label: "אחר", key: gKey, category: "general" })).toEqual({ ok: false, reason: "exists" });
    expect(await dict.createDictionaryEntry({ label: "אחר", key: gKey, category: "org" })).toEqual({ ok: false, reason: "exists" });

    const o = await dict.createDictionaryEntry({ label: `תיק ${stamp}`, type: "number", category: "org" });
    expect(o.ok).toBe(true);
    const oKey = (o as { key: string }).key;
    cleanup.push(() => db.delete(schema.organizationFieldDefs).where(eq(schema.organizationFieldDefs.key, oKey)));

    const all = await dict.listDictionary();
    const gRow = all.find((f) => f.key === gKey)!;
    const oRow = all.find((f) => f.key === oKey)!;
    expect(gRow).toMatchObject({ category: "general", type: "short_text" });
    expect(oRow).toMatchObject({ category: "org", type: "number", label: `תיק ${stamp}` });

    // Rename keeps the Hebrew name; an organization field only takes single-line types.
    const renamed = `renamed${stamp}`;
    expect(await dict.updateDictionaryEntry(oRow.id, "org", { label: `תיק חדש ${stamp}`, type: "bank_account", key: renamed })).toEqual({ ok: true, key: renamed });
    cleanup.push(() => db.delete(schema.organizationFieldDefs).where(eq(schema.organizationFieldDefs.key, renamed)));
    const after = (await dict.listDictionary()).find((f) => f.id === oRow.id)!;
    expect(after).toMatchObject({ key: renamed, label: `תיק חדש ${stamp}`, type: "short_text" });

    await dict.deleteDictionaryEntry(gRow.id);
    expect((await dict.listDictionary()).some((f) => f.id === gRow.id)).toBe(false);
  });
});
