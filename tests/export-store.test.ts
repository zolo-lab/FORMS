/** Runs against the dev database; skipped when DATABASE_URL is not set. */
import { afterAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("export-store (dev DB)", () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => {});
  });

  it("exports answers per export key and zips only requests that have a final PDF", async () => {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const { loadExport, loadFinalPdfs } = await import("@/server/export-store");
    const { buildExportTable } = await import("@/lib/export/rows");
    const { putFile } = await import("@/server/storage");

    const stamp = Date.now();
    const [org] = await db.insert(schema.organizations).values({ name: `ארגון ייצוא ${stamp}`, registrationNumber: `X${stamp}` }).returning();
    cleanup.push(() => db.delete(schema.organizations).where(eq(schema.organizations.id, org!.id)));
    const [pkg] = await db.insert(schema.packageTemplates).values({ name: `pkg-x-${stamp}`, workflow: { steps: [] } }).returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));
    const [tpl] = await db.insert(schema.formTemplates).values({ slug: `x-${stamp}`, title: `טופס ${stamp}` }).returning();
    cleanup.push(() => db.delete(schema.formTemplates).where(eq(schema.formTemplates.id, tpl!.id)));
    const definition = {
      schemaVersion: 1 as const,
      title: "t",
      pages: [{ id: "p", title: "", fields: [{ id: "firstName", type: "short_text" as const, label: "שם", exportKey: "FNAME" }] }],
    };
    const [ver] = await db.insert(schema.formTemplateVersions).values({ templateId: tpl!.id, version: 1, definition }).returning();

    const mk = async (name: string, answers: Record<string, unknown>) => {
      const [r] = await db.insert(schema.requests).values({ organizationId: org!.id, packageTemplateId: pkg!.id, subjectName: name, status: "completed", apiParams: { requesterAnswers: answers } }).returning();
      await db.insert(schema.packageDocuments).values({ requestId: r!.id, templateVersionId: ver!.id, order: 1 });
      return r!;
    };
    const a = await mk("דנה", { firstName: "דנה" });
    const b = await mk("יוסי", { firstName: "יוסי" });
    cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.organizationId, org!.id)));

    const rows = await loadExport({ filters: { org: org!.id, page: 1 } });
    expect(rows).toHaveLength(2);
    const table = buildExportTable(rows);
    expect(table[0]!.at(-1)).toBe("FNAME");
    expect(table.slice(1).map((r) => r.at(-1)).sort()).toEqual(["דנה", "יוסי"]);
    expect(rows[0]!.status).toBe("הושלם");

    expect(await loadExport({ ids: [a.id] })).toHaveLength(1);
    expect(await loadFinalPdfs({ ids: [a.id, b.id] })).toEqual([]);

    const stored = await putFile({ name: "x.pdf", mime: "application/pdf", bytes: new TextEncoder().encode("%PDF-1.4 test") });
    await db.update(schema.packageDocuments).set({ finalFileId: stored.id }).where(eq(schema.packageDocuments.requestId, a.id));
    const pdfs = await loadFinalPdfs({ ids: [a.id, b.id] });
    expect(pdfs.map((p) => p.name)).toEqual([`דנה - טופס ${stamp}.pdf`]);
  });
});
