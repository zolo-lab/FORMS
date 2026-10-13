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

  it("completing a request produces a final PDF per document whose sha256 matches the stored file", async () => {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const store = await import("@/server/requests-store");
    const { getFile, sha256Hex } = await import("@/server/storage");

    const [org] = await db.select().from(schema.organizations).limit(1);
    const [tpl] = await db
      .insert(schema.formTemplates)
      .values({ slug: `final-${Date.now()}`, title: "טופס סיום", status: "active", publishedVersion: 1 })
      .returning();
    cleanup.push(() => db.delete(schema.formTemplates).where(eq(schema.formTemplates.id, tpl!.id)));
    await db.insert(schema.formTemplateVersions).values({
      templateId: tpl!.id,
      version: 1,
      publishedAt: new Date(),
      definition: {
        schemaVersion: 1,
        title: "טופס סיום",
        pages: [{ id: "p1", title: "עמוד", fields: [{ id: "fullName", type: "short_text", label: "שם מלא", filledBy: "employee" }] }],
        settings: { layout: "single" },
      } as never,
    });
    const [pkg] = await db
      .insert(schema.packageTemplates)
      .values({
        name: `test-final-${Date.now()}`,
        workflow: { steps: [{ order: 1, role: "employee", action: "fill_and_sign" }] },
      })
      .returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));
    await db.insert(schema.packageTemplateItems).values({ packageTemplateId: pkg!.id, templateId: tpl!.id, order: 1, required: true });

    const id = await store.createRequest({ packageTemplateId: pkg!.id, organizationId: org!.id, subject: { name: "דנה כהן", email: "dana@example.test" } });
    cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.id, id)));
    await store.sendRequest(id);
    const r = (await store.getRequest(id))!;
    await store.applyStepAction(r.steps[0]!.id, { type: "open" });
    await store.applyStepAction(r.steps[0]!.id, { type: "submit", answers: { fullName: "דנה כהן" } });

    const done = (await store.getRequest(id))!;
    expect(done.request.status).toBe("completed");
    expect(done.documents).toHaveLength(1);
    const doc = done.documents[0]!;
    expect(doc.finalFileId).toBeTruthy();
    expect(doc.status).toBe("completed");
    const file = (await getFile(doc.finalFileId!))!;
    expect(sha256Hex(file.bytes)).toBe(doc.finalSha256);
    expect(Buffer.from(file.bytes.slice(0, 5)).toString()).toBe("%PDF-");
    cleanup.push(() => db.delete(schema.storedFiles).where(eq(schema.storedFiles.id, doc.finalFileId!)));
  });

  it("admin can extend the deadline, replace a recipient (old link dies) and cancel", async () => {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const store = await import("@/server/requests-store");

    const [org] = await db.select().from(schema.organizations).limit(1);
    const [pkg] = await db
      .insert(schema.packageTemplates)
      .values({ name: `test-admin-${Date.now()}`, workflow: { steps: [{ order: 1, role: "approver", action: "approve", assignee: { name: "ישן", email: "old@example.test" } }] } })
      .returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));
    const id = await store.createRequest({ packageTemplateId: pkg!.id, organizationId: org!.id, subject: { name: "עובד" }, expiresInDays: 5 });
    cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.id, id)));
    await store.sendRequest(id);
    let r = (await store.getRequest(id))!;
    const before = r.request.expiresAt!;

    const next = await store.extendExpiry(id, 10);
    expect(next.getTime() - before.getTime()).toBe(10 * 86_400_000);
    await expect(store.extendExpiry(id, 0)).rejects.toThrow();

    const step = r.steps[0]!;
    const tokensBefore = await db.select().from(schema.stepTokens).where(eq(schema.stepTokens.stepId, step.id));
    expect(tokensBefore[0]!.expiresAt!.getTime()).toBe(next.getTime());
    await store.changeAssignee(step.id, { name: "חדש", email: "new@example.test" });
    r = (await store.getRequest(id))!;
    expect(r.steps[0]!.assigneeName).toBe("חדש");
    const tokensAfter = await db.select().from(schema.stepTokens).where(eq(schema.stepTokens.stepId, step.id));
    expect(tokensAfter.every((t) => t.revokedAt !== null)).toBe(true);
    expect(r.events.map((e) => e.type)).toEqual(expect.arrayContaining(["request_extended", "step_assignee_changed"]));

    await store.cancelRequest(id, "בוטל בבדיקה");
    r = (await store.getRequest(id))!;
    expect(r.request.status).toBe("cancelled");
    await expect(store.changeAssignee(step.id, { name: "x" })).rejects.toThrow();
    // A request that is already cancelled can't be cancelled again (no new event, same history).
    const eventsBefore = r.events.length;
    await expect(store.cancelRequest(id, "שוב")).rejects.toThrow();
    expect((await store.getRequest(id))!.events.length).toBe(eventsBefore);
  });

  it("cancelRequest leaves a completed request untouched", async () => {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const store = await import("@/server/requests-store");
    const [org] = await db.select().from(schema.organizations).limit(1);
    const [pkg] = await db
      .insert(schema.packageTemplates)
      .values({ name: `test-cancel-${Date.now()}`, workflow: { steps: [{ order: 1, role: "requester", action: "fill" }] } })
      .returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));
    const id = await store.createRequest({ packageTemplateId: pkg!.id, organizationId: org!.id, subject: { name: "עובד" } });
    cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.id, id)));
    await store.sendRequest(id);
    const done = (await store.getRequest(id))!;
    expect(done.request.status).toBe("completed");
    await expect(store.cancelRequest(id, "לא אמור לעבוד")).rejects.toThrow();
    const after = (await store.getRequest(id))!;
    expect(after.request.status).toBe("completed");
    expect(after.request.completedAt?.getTime()).toBe(done.request.completedAt?.getTime());
    expect(after.events.length).toBe(done.events.length);
  });

  it("two concurrent submits of the same step: one wins, the next step is activated once", async () => {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const store = await import("@/server/requests-store");
    const [org] = await db.select().from(schema.organizations).limit(1);
    const [pkg] = await db
      .insert(schema.packageTemplates)
      .values({
        name: `test-race-${Date.now()}`,
        workflow: { steps: [{ order: 1, role: "employee", action: "fill" }, { order: 2, role: "payroll", action: "approve", assignee: { name: "שכר", email: "p@example.test" } }] },
      })
      .returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));
    const id = await store.createRequest({ packageTemplateId: pkg!.id, organizationId: org!.id, subject: { name: "עובד", email: "e@example.test" } });
    cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.id, id)));
    await store.sendRequest(id);
    const step = (await store.getRequest(id))!.steps.find((s) => s.role === "employee")!;
    const results = await Promise.allSettled([
      store.applyStepAction(step.id, { type: "submit", answers: { a: 1 } }),
      store.applyStepAction(step.id, { type: "submit", answers: { a: 2 } }),
      store.applyStepAction(step.id, { type: "submit", answers: { a: 3 } }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason instanceof store.StepConflictError)).toBe(true);
    const full = (await store.getRequest(id))!;
    expect(full.events.filter((e) => e.type === "step_activated")).toHaveLength(2); // employee (on send) + payroll
    const invites = await db.select().from(schema.notifications).where(eq(schema.notifications.requestId, id));
    expect(invites.filter((n) => n.templateKey === "step_invite" && n.to === "p@example.test")).toHaveLength(1);
  });

  it("dueHours sets the step and request due date, and a past due date makes the request overdue", async () => {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const store = await import("@/server/requests-store");
    const dash = await import("@/server/dashboard-store");
    const [org] = await db.select().from(schema.organizations).limit(1);
    const [pkg] = await db
      .insert(schema.packageTemplates)
      .values({ name: `test-due-${Date.now()}`, workflow: { steps: [{ order: 1, role: "employee", action: "fill", dueHours: 24 }] } })
      .returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));
    const id = await store.createRequest({ packageTemplateId: pkg!.id, organizationId: org!.id, subject: { name: "עובד", email: "e@example.test" }, expiresInDays: 30 });
    cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.id, id)));
    await store.sendRequest(id);
    const r = (await store.getRequest(id))!;
    const diffH = (r.request.dueAt!.getTime() - Date.now()) / 3_600_000;
    expect(diffH).toBeGreaterThan(23.9);
    expect(diffH).toBeLessThan(24.1);
    expect(r.steps[0]!.dueAt?.getTime()).toBe(r.request.dueAt!.getTime());

    expect((await dash.queryRequests({ overdue: true, page: 1, pkg: pkg!.id }, new Date(), 50)).rows.some((x) => x.id === id)).toBe(false);
    const later = new Date(Date.now() + 25 * 3_600_000);
    const hit = (await dash.queryRequests({ overdue: true, page: 1, pkg: pkg!.id }, later, 50)).rows.find((x) => x.id === id);
    expect(hit?.overdue).toBe(true);
  });

  it("a draft that was never sent can be cancelled", async () => {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const store = await import("@/server/requests-store");
    const [org] = await db.select().from(schema.organizations).limit(1);
    const [pkg] = await db
      .insert(schema.packageTemplates)
      .values({ name: `test-draftcancel-${Date.now()}`, workflow: { steps: [{ order: 1, role: "employee", action: "fill" }] } })
      .returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));
    const id = await store.createRequest({ packageTemplateId: pkg!.id, organizationId: org!.id, subject: { name: "עובד" } });
    cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.id, id)));
    await store.cancelRequest(id, "טיוטה נמחקה");
    const r = (await store.getRequest(id))!;
    expect(r.request.status).toBe("cancelled");
    expect(r.request.cancelledAt).toBeTruthy();
    expect(r.events.map((e) => e.type)).toContain("request_cancelled");
  });

  it("collectedAnswers ignores drafts except the owner's own", async () => {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const store = await import("@/server/requests-store");
    const [org] = await db.select().from(schema.organizations).limit(1);
    const [pkg] = await db
      .insert(schema.packageTemplates)
      .values({ name: `test-draft-${Date.now()}`, workflow: { steps: [{ order: 1, role: "requester", action: "fill" }, { order: 2, role: "employee", action: "fill_and_sign" }] } })
      .returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));
    const id = await store.createRequest({ packageTemplateId: pkg!.id, organizationId: org!.id, subject: { name: "עובד", email: "e@example.test" }, requesterAnswers: { salary: 9000 } });
    cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.id, id)));
    await store.sendRequest(id);
    const step = (await store.getRequest(id))!.steps.find((s) => s.role === "employee")!;
    await db.insert(schema.submissions).values({ requestId: id, stepId: step.id, status: "draft", answers: { salary: 1, note: "טיוטה" } });
    expect(await store.collectedAnswers(id)).toEqual(expect.objectContaining({ salary: 9000 }));
    expect((await store.collectedAnswers(id)).note).toBeUndefined();
    expect(await store.collectedAnswers(id, { draftStepId: step.id })).toEqual(expect.objectContaining({ salary: 1, note: "טיוטה" }));
  });
});
