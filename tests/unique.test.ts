/** Runs against the dev database; skipped when DATABASE_URL is not set. */
import { afterAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("unique fields (dev DB)", () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => {});
  });

  it("flags a value already submitted in another request of the same template", async () => {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const { duplicateErrors } = await import("@/server/unique");

    const stamp = Date.now();
    const [org] = await db.insert(schema.organizations).values({ name: `ארגון ייחודי ${stamp}`, registrationNumber: `U${stamp}` }).returning();
    cleanup.push(() => db.delete(schema.organizations).where(eq(schema.organizations.id, org!.id)));
    const [pkg] = await db.insert(schema.packageTemplates).values({ name: `pkg-u-${stamp}`, workflow: { steps: [] } }).returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));
    const [tpl] = await db.insert(schema.formTemplates).values({ slug: `u-${stamp}`, title: `טופס ${stamp}` }).returning();
    cleanup.push(() => db.delete(schema.formTemplates).where(eq(schema.formTemplates.id, tpl!.id)));
    const definition = {
      schemaVersion: 1 as const, title: "t",
      pages: [{ id: "p", title: "", fields: [{ id: "badge", type: "short_text" as const, label: "מספר", unique: true }] }],
    };
    const [ver] = await db.insert(schema.formTemplateVersions).values({ templateId: tpl!.id, version: 1, definition }).returning();

    const mkRequest = async (name: string) => {
      const [r] = await db.insert(schema.requests).values({ organizationId: org!.id, packageTemplateId: pkg!.id, subjectName: name, status: "in_progress" }).returning();
      await db.insert(schema.packageDocuments).values({ requestId: r!.id, templateVersionId: ver!.id, order: 1 });
      return r!;
    };
    const first = await mkRequest("ראשון");
    const second = await mkRequest("שני");
    cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.organizationId, org!.id)));
    const [step] = await db.insert(schema.signingSteps).values({ requestId: first.id, order: 1, role: "employee", status: "completed" }).returning();
    await db.insert(schema.submissions).values({ requestId: first.id, stepId: step!.id, status: "submitted", answers: { badge: "A-100" } });

    expect(await duplicateErrors(second.id, definition, { badge: "A-100" })).toEqual({ badge: "ערך זה כבר קיים במערכת" });
    expect(await duplicateErrors(second.id, definition, { badge: "A-101" })).toEqual({});
    // The request that holds the value is not a duplicate of itself.
    expect(await duplicateErrors(first.id, definition, { badge: "A-100" })).toEqual({});
  });
});
