/**
 * The one rule of `package_documents`: a part cut out of a document must never be mistaken for a document of
 * the request. Runs against the dev database; skipped when DATABASE_URL is not set.
 */
import { afterAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("parts are not documents of the request (dev DB)", () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => {});
  });

  it("every query that means 'the documents of this request' skips the parts", async () => {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const store = await import("@/server/requests-store");
    const { requestDocumentView } = await import("@/server/dashboard-store");

    const [org] = await db.select().from(schema.organizations).limit(1);
    expect(org).toBeTruthy();

    // A package with one real document, so the request is created with exactly one package_documents row.
    const stamp = Date.now();
    const [template] = await db.insert(schema.formTemplates).values({ title: `test-parts-${stamp}`, slug: `test-parts-${stamp}` }).returning();
    cleanup.push(() => db.delete(schema.formTemplates).where(eq(schema.formTemplates.id, template!.id)));
    const [version] = await db
      .insert(schema.formTemplateVersions)
      .values({ templateId: template!.id, version: 1, definition: { schemaVersion: 1 as const, title: template!.title, pages: [{ id: "p1", title: "עמוד 1", fields: [] }] }, publishedAt: new Date() })
      .returning();
    await db.update(schema.formTemplates).set({ publishedVersion: 1 }).where(eq(schema.formTemplates.id, template!.id));

    const [pkg] = await db
      .insert(schema.packageTemplates)
      .values({ name: `test-parts-pkg-${Date.now()}`, workflow: { steps: [{ order: 1, role: "requester", action: "fill" }, { order: 2, role: "employee", action: "fill_and_sign" }] } })
      .returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));
    await db.insert(schema.packageTemplateItems).values({ packageTemplateId: pkg!.id, templateId: template!.id, order: 1 });

    const id = await store.createRequest({
      packageTemplateId: pkg!.id,
      organizationId: org!.id,
      subject: { name: "עובד בדיקה", email: "parts@example.test" },
    });
    cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.id, id)));

    const before = (await store.getRequest(id))!;
    expect(before.documents).toHaveLength(1);
    const parent = before.documents[0]!;

    // Cut a part out of it, exactly as "עיבוד טופס" will.
    const [part] = await db
      .insert(schema.packageDocuments)
      .values({ requestId: id, templateVersionId: version!.id, order: parent.order, parentDocumentId: parent.id, pages: "1-2", partName: "101", status: "completed" })
      .returning();
    expect(part!.parentDocumentId).toBe(parent.id);

    // The request still has one document everywhere it is asked.
    const after = (await store.getRequest(id))!;
    expect(after.documents.map((d) => d.id)).toEqual([parent.id]);

    const view = await requestDocumentView(id);
    expect(view).toHaveLength(1);

    // …while the part itself is still there, reachable by its own id.
    const all = await db.select().from(schema.packageDocuments).where(eq(schema.packageDocuments.requestId, id));
    expect(all).toHaveLength(2);
    expect(all.filter((d) => d.parentDocumentId === parent.id)).toHaveLength(1);
  });
});

describe.skipIf(!hasDb)("cutting a document into parts (dev DB)", () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => {});
  });

  it("stores each part as its own PDF holding exactly its pages", async () => {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const { PDFDocument } = await import("pdf-lib");
    const { cutDocumentParts } = await import("@/server/processing");
    const { getFile } = await import("@/server/storage");
    const { partsOf } = await import("@/server/package-docs");

    const [org] = await db.select().from(schema.organizations).limit(1);
    const stamp = Date.now();
    const [template] = await db.insert(schema.formTemplates).values({ title: `test-cut-${stamp}`, slug: `test-cut-${stamp}` }).returning();
    cleanup.push(() => db.delete(schema.formTemplates).where(eq(schema.formTemplates.id, template!.id)));
    const [version] = await db
      .insert(schema.formTemplateVersions)
      .values({ templateId: template!.id, version: 1, definition: { schemaVersion: 1 as const, title: template!.title, pages: [{ id: "p1", title: "עמוד 1", fields: [] }] } })
      .returning();
    const [pkg] = await db.insert(schema.packageTemplates).values({ name: `test-cut-pkg-${stamp}`, workflow: { steps: [{ order: 1, role: "requester", action: "fill" }] } }).returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));
    const [request] = await db
      .insert(schema.requests)
      .values({ packageTemplateId: pkg!.id, organizationId: org!.id, subjectName: "עובד בדיקה", status: "completed" })
      .returning();
    cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.id, request!.id)));
    const [parent] = await db
      .insert(schema.packageDocuments)
      .values({ requestId: request!.id, templateVersionId: version!.id, order: 1 })
      .returning();

    // A 4-page document, pages sized so each one is identifiable after the cut.
    const src = await PDFDocument.create();
    for (let i = 0; i < 4; i++) src.addPage([200 + i, 400]);
    const base = await src.save();

    const run = () =>
      cutDocumentParts({
        requestId: request!.id,
        parentDocumentId: parent!.id,
        templateVersionId: version!.id,
        order: 1,
        title: template!.title,
        base,
        parts: [
          { id: "a", name: "101", pages: "1-2" },
          { id: "b", name: "הסכם", pages: "4" },
        ],
      });

    const first = await run();
    expect(first).toEqual({ created: 2, failed: [] });

    const rows = await db.select().from(schema.packageDocuments).where(partsOf(request!.id));
    expect(rows.map((r) => r.partName).sort()).toEqual(["101", "הסכם"]);

    const part101 = rows.find((r) => r.partName === "101")!;
    const file = await getFile(part101.finalFileId!);
    const widths = (await PDFDocument.load(file!.bytes)).getPages().map((p) => Math.round(p.getWidth()));
    expect(widths).toEqual([200, 201]);

    // Re-running replaces the parts instead of piling up a second set.
    const second = await run();
    expect(second.created).toBe(2);
    expect(await db.select().from(schema.packageDocuments).where(partsOf(request!.id))).toHaveLength(2);
  });

  it("reports a bad range and still files the parts that are fine", async () => {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const { PDFDocument } = await import("pdf-lib");
    const { cutDocumentParts } = await import("@/server/processing");
    const { partsOf } = await import("@/server/package-docs");

    const [org] = await db.select().from(schema.organizations).limit(1);
    const stamp = Date.now();
    const [template] = await db.insert(schema.formTemplates).values({ title: `test-cut2-${stamp}`, slug: `test-cut2-${stamp}` }).returning();
    cleanup.push(() => db.delete(schema.formTemplates).where(eq(schema.formTemplates.id, template!.id)));
    const [version] = await db
      .insert(schema.formTemplateVersions)
      .values({ templateId: template!.id, version: 1, definition: { schemaVersion: 1 as const, title: template!.title, pages: [{ id: "p1", title: "עמוד 1", fields: [] }] } })
      .returning();
    const [pkg] = await db.insert(schema.packageTemplates).values({ name: `test-cut2-pkg-${stamp}`, workflow: { steps: [{ order: 1, role: "requester", action: "fill" }] } }).returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));
    const [request] = await db
      .insert(schema.requests)
      .values({ packageTemplateId: pkg!.id, organizationId: org!.id, subjectName: "עובד בדיקה", status: "completed" })
      .returning();
    cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.id, request!.id)));
    const [parent] = await db.insert(schema.packageDocuments).values({ requestId: request!.id, templateVersionId: version!.id, order: 1 }).returning();

    const doc = await PDFDocument.create();
    doc.addPage([200, 400]);
    doc.addPage([201, 400]);

    const r = await cutDocumentParts({
      requestId: request!.id,
      parentDocumentId: parent!.id,
      templateVersionId: version!.id,
      order: 1,
      title: template!.title,
      base: await doc.save(),
      parts: [
        { id: "a", name: "טוב", pages: "1" },
        { id: "b", name: "מחוץ לתחום", pages: "9" },
      ],
    });

    expect(r.created).toBe(1);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0]!.part).toBe("מחוץ לתחום");
    expect(await db.select().from(schema.packageDocuments).where(partsOf(request!.id))).toHaveLength(1);
  });
});
