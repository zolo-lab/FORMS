/** Runs against the dev database; skipped when DATABASE_URL is not set. */
import { afterAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("requests-store (dev DB)", () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => {});
  });

  it("create → send → step 1 auto-done → step 2 active → complete → payroll → completed", async () => {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const store = await import("@/server/requests-store");

    const [org] = await db.select().from(schema.organizations).limit(1);
    expect(org).toBeTruthy();
    const [pkg] = await db
      .insert(schema.packageTemplates)
      .values({
        name: `test-pkg-${Date.now()}`,
        workflow: {
          steps: [
            { order: 1, role: "requester", action: "fill" },
            { order: 2, role: "employee", action: "fill_and_sign" },
            { order: 3, role: "payroll", action: "approve", assignee: { name: "שכר", email: "payroll@example.test" } },
          ],
        },
      })
      .returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));

    const id = await store.createRequest({
      packageTemplateId: pkg!.id,
      organizationId: org!.id,
      subject: { name: "עובד בדיקה", email: "employee@example.test" },
      requesterAnswers: { salary: 9000 },
    });
    cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.id, id)));

    await store.sendRequest(id);
    let r = (await store.getRequest(id))!;
    expect(r.request.status).toBe("in_progress");
    expect(r.steps.map((s) => s.status)).toEqual(["completed", "active", "pending"]);
    expect(r.request.currentOrder).toBe(2);

    const mails = await db.select().from(schema.notifications).where(eq(schema.notifications.requestId, id));
    expect(mails).toHaveLength(1);
    expect(mails[0]!.to).toBe("employee@example.test");
    expect(mails[0]!.body).toMatch(/\/s\/[A-Za-z0-9_-]{43}/);
    const tokens = await db.select().from(schema.stepTokens).where(eq(schema.stepTokens.stepId, r.steps[1]!.id));
    expect(tokens).toHaveLength(1);
    expect(mails[0]!.body).not.toContain(tokens[0]!.tokenHash);

    await store.applyStepAction(r.steps[1]!.id, { type: "open" });
    await store.applyStepAction(r.steps[1]!.id, { type: "submit", answers: { firstName: "דנה" } });
    r = (await store.getRequest(id))!;
    expect(r.steps.map((s) => s.status)).toEqual(["completed", "completed", "active"]);
    const revoked = await db.select().from(schema.stepTokens).where(eq(schema.stepTokens.stepId, r.steps[1]!.id));
    expect(revoked[0]!.revokedAt).not.toBeNull();

    await store.applyStepAction(r.steps[2]!.id, { type: "submit", answers: {} });
    r = (await store.getRequest(id))!;
    expect(r.request.status).toBe("completed");
    expect(r.request.completedAt).not.toBeNull();
    expect(r.events.map((e) => e.type)).toContain("request_completed");
  });

  it("return sends the request back to the earlier step", async () => {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const store = await import("@/server/requests-store");
    const [org] = await db.select().from(schema.organizations).limit(1);
    const [pkg] = await db
      .insert(schema.packageTemplates)
      .values({
        name: `test-pkg-ret-${Date.now()}`,
        workflow: {
          steps: [
            { order: 1, role: "employee", action: "fill" },
            { order: 2, role: "approver", action: "approve", assignee: { name: "מאשר", email: "m@example.test" } },
          ],
        },
      })
      .returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));
    const id = await store.createRequest({ packageTemplateId: pkg!.id, organizationId: org!.id, subject: { name: "ב", email: "e@example.test" } });
    cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.id, id)));
    await store.sendRequest(id);
    let r = (await store.getRequest(id))!;
    await store.applyStepAction(r.steps[0]!.id, { type: "submit", answers: {} });
    r = (await store.getRequest(id))!;
    await store.applyStepAction(r.steps[1]!.id, { type: "return", toStepId: r.steps[0]!.id, reason: "חסר מסמך" });
    r = (await store.getRequest(id))!;
    expect(r.request.status).toBe("returned");
    expect(r.steps.map((s) => s.status)).toEqual(["active", "returned"]);
  });
});
