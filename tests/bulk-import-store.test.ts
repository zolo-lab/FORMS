/** Runs against the dev database; skipped when DATABASE_URL is not set. */
import { afterAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("bulk import actions (dev DB)", () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => {});
  });

  it("validates rows, creates only the valid ones in chunks and records the job", async () => {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const actions = await import("@/app/admin/requests/bulk/actions");
    const stamp = Date.now() + Math.floor(Math.random() * 1000);

    const [org] = await db.insert(schema.organizations).values({ name: `ארגון ייבוא ${stamp}`, registrationNumber: `I${stamp}` }).returning();
    cleanup.push(() => db.delete(schema.organizations).where(eq(schema.organizations.id, org!.id)));
    const [pkg] = await db
      .insert(schema.packageTemplates)
      .values({ name: `test-bulk-${stamp}`, organizationId: org!.id, workflow: { steps: [{ order: 1, role: "employee", action: "fill_and_sign" }] } })
      .returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));
    cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.packageTemplateId, pkg!.id)));

    const rows = [
      ["שם", "מייל", "טלפון"],
      ["דנה כהן", "dana@example.test", "0501234567"],
      ["", "noname@example.test", "0501234568"],
      ["יוסי לוי", "not-an-email", "0501234569"],
      ["רונית מזרחי", "ronit@example.test", ""],
    ];
    const mapping = { "subject.name": 0, "subject.email": 1, "subject.phone": 2 };

    const checked = await actions.checkImportAction({ packageId: pkg!.id, rows, mapping, send: false });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.total).toBe(4);
    expect(checked.errors.map((e) => e.row).sort()).toEqual([3, 4]);
    expect(checked.valid).toBe(2);

    const job = await actions.startImportJobAction({ packageId: pkg!.id, organizationId: org!.id, rowCount: checked.records.length });
    expect("jobId" in job).toBe(true);
    if (!("jobId" in job)) return;
    cleanup.push(() => db.delete(schema.bulkJobs).where(eq(schema.bulkJobs.id, job.jobId)));

    const res = await actions.createImportChunkAction({ jobId: job.jobId, packageId: pkg!.id, organizationId: org!.id, records: checked.records, send: false, final: true });
    expect(res.created).toBe(2);
    expect(res.errors).toEqual([]);

    const made = await db.select().from(schema.requests).where(eq(schema.requests.packageTemplateId, pkg!.id));
    expect(made.map((r) => r.subjectName).sort()).toEqual(["דנה כהן", "רונית מזרחי"].sort());
    const [j] = await db.select().from(schema.bulkJobs).where(eq(schema.bulkJobs.id, job.jobId));
    expect(j).toMatchObject({ createdCount: 2, status: "done" });
  });
});
