/** Runs against the dev database; skipped when DATABASE_URL is not set. */
import { afterAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("dashboard-store (dev DB)", () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => {});
  });

  it("filters, paginates and computes KPIs for a known data set", async () => {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const { queryRequests, requestKpis } = await import("@/server/dashboard-store");

    const stamp = Date.now();
    // An isolated organization, so the numbers below are exact whatever else is in the dev database.
    const [org] = await db.insert(schema.organizations).values({ name: `ארגון בדיקה ${stamp}`, registrationNumber: `T${stamp}` }).returning();
    cleanup.push(() => db.delete(schema.organizations).where(eq(schema.organizations.id, org!.id)));
    const [pkg] = await db.insert(schema.packageTemplates).values({ name: `pkg-${stamp}`, workflow: { steps: [] } }).returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));

    const day = 86_400_000;
    const now = new Date();
    const mk = (name: string, status: "draft" | "in_progress" | "completed", over: Partial<typeof schema.requests.$inferInsert> = {}) =>
      db.insert(schema.requests).values({ organizationId: org!.id, packageTemplateId: pkg!.id, subjectName: name, status, ...over }).returning();
    const [a] = await mk("אבי כהן", "in_progress", { subjectIdNumber: "000000018", expiresAt: new Date(now.getTime() + 10 * day) });
    const [b] = await mk("בני לוי", "in_progress", { expiresAt: new Date(now.getTime() - 2 * day) }); // overdue
    await mk("גילה דוד", "draft");
    await mk("דנה מזרחי", "completed", { createdAt: new Date(now.getTime() - 5 * day), completedAt: new Date(now.getTime() - 3 * day) }); // 2 days
    await mk("הדר שלום", "completed", { createdAt: new Date(now.getTime() - 8 * day), completedAt: new Date(now.getTime() - 4 * day) }); // 4 days
    await mk("ותיק ישן", "completed", { createdAt: new Date(now.getTime() - 90 * day), completedAt: new Date(now.getTime() - 60 * day) }); // outside 30d
    cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.organizationId, org!.id)));

    await db.insert(schema.signingSteps).values([
      { requestId: a!.id, order: 1, role: "employee", status: "active", assigneeName: "אבי כהן", activatedAt: new Date(now.getTime() - 3 * day) },
      { requestId: a!.id, order: 2, role: "payroll", status: "pending" },
      { requestId: b!.id, order: 1, role: "approver", status: "in_progress", assigneeName: "מנהל" },
    ]);

    const all = await queryRequests({ org: org!.id, page: 1 });
    expect(all.total).toBe(6);

    const overdue = await queryRequests({ org: org!.id, overdue: true, page: 1 });
    expect(overdue.rows.map((r) => r.subjectName)).toEqual(["בני לוי"]);
    expect(overdue.rows[0]!.overdue).toBe(true);

    const byRole = await queryRequests({ org: org!.id, role: "employee", page: 1 });
    expect(byRole.rows.map((r) => r.subjectName)).toEqual(["אבי כהן"]);
    expect(byRole.rows[0]!.waitingFor).toEqual([{ role: "employee", name: "אבי כהן" }]);
    expect(byRole.rows[0]!.daysInStep).toBe(3);
    expect(byRole.rows[0]!.progress).toEqual({ done: 0, total: 2 });

    expect((await queryRequests({ org: org!.id, q: "000000018", page: 1 })).rows).toHaveLength(1);
    expect((await queryRequests({ org: org!.id, q: "כהן", page: 1 })).rows).toHaveLength(1);
    // LIKE wildcards in the search box are literal.
    expect((await queryRequests({ org: org!.id, q: "%", page: 1 })).total).toBe(0);
    expect((await queryRequests({ org: org!.id, status: "completed", page: 1 })).total).toBe(3);
    expect((await queryRequests({ org: org!.id, page: 99 })).rows.length).toBeGreaterThan(0); // page is clamped

    const k = await requestKpis(org!.id, now);
    expect(k.active).toBe(2);
    expect(k.overdue).toBe(1);
    expect(k.completed30).toBe(2);
    expect(k.medianDaysToComplete).toBe(3); // median of 2 and 4
    expect(Object.fromEntries(k.waitingByRole.map((w) => [w.role, w.count]))).toEqual({ employee: 1, approver: 1 });
  });
});
