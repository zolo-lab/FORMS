/** Runs against the dev database; skipped when DATABASE_URL is not set. */
import { afterAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("form versions (dev DB)", () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => {});
  });

  it("lists published versions and brings an earlier one back as the draft", async () => {
    const { db, schema } = await import("@/db");
    const { and, eq } = await import("drizzle-orm");
    const store = await import("@/server/forms-store");
    const { blankForm } = await import("@/lib/forms/builder");
    const title = `גרסאות ${Date.now()}`;
    const id = await store.createTemplate(title);
    cleanup.push(() => store.deleteTemplate(id));
    const publish = async (version: number) => {
      await db.update(schema.formTemplateVersions).set({ publishedAt: new Date() }).where(and(eq(schema.formTemplateVersions.templateId, id), eq(schema.formTemplateVersions.version, version)));
      await db.update(schema.formTemplates).set({ publishedVersion: version }).where(eq(schema.formTemplates.id, id));
    };
    await publish(1);
    const v1 = (await store.getEditorData(id))!.version.definition;

    // Version 2: a changed title, published.
    expect(await store.saveDraft(id, { ...blankForm(title), title: `${title} ב` })).toEqual({ version: 2 });
    await publish(2);

    const list = await store.listVersions(id);
    expect(list.map((v) => v.version)).toEqual([2, 1]);
    expect(list.find((v) => v.version === 2)!.inUse).toBe(true);
    expect(list.find((v) => v.version === 1)!.inUse).toBe(false);

    // Back to version 1: it becomes draft 3; the published version stays 2 until publishing.
    expect(await store.restoreVersion(id, 1)).toEqual({ version: 3 });
    const now = (await store.getEditorData(id))!;
    expect(now.version.version).toBe(3);
    expect(now.version.publishedAt).toBeNull();
    expect(now.version.definition.title).toBe(v1.title);
    expect(now.template.publishedVersion).toBe(2);
    expect((await store.listVersions(id)).map((v) => v.version)).toEqual([2, 1]);

    expect(await store.restoreVersion(id, 99)).toEqual({ error: "הגרסה לא נמצאה" });
  });
});
