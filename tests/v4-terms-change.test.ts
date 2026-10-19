/**
 * v4 end-to-end on the service layer: "שינוי תנאים" with internal fields, an expiry rule, an employee record,
 * completion recipients and handling steps. Runs against the dev database; skipped when DATABASE_URL is not set.
 */
import { afterAll, describe, expect, it } from "vitest";
import { formDefinitionSchema } from "@/lib/forms/schema";
import { termsChangeAnswers, termsChangeRequest, termsChangeWorkflow } from "./fixtures/package-terms-change";

const hasDb = !!process.env.DATABASE_URL;

describe("terms-change fixture", () => {
  it("is a valid form definition", () => {
    expect(formDefinitionSchema.safeParse(termsChangeRequest).success).toBe(true);
  });
});

describe.skipIf(!hasDb)("terms change, end to end (dev DB)", () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => {});
  });

  it("internal fields stay with staff; expiry, employee, completion mail and follow-up work", async () => {
    const { db, schema } = await import("@/db");
    const { and, eq } = await import("drizzle-orm");
    const store = await import("@/server/requests-store");
    const { createToken } = await import("@/lib/auth/tokens");
    const { loadByToken } = await import("@/server/signing");
    const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const [org] = await db.insert(schema.organizations).values({ name: `ארגון v4 ${stamp}`, registrationNumber: `V4${stamp}` }).returning();
    cleanup.push(() => db.delete(schema.organizations).where(eq(schema.organizations.id, org!.id)));
    const [tpl] = await db.insert(schema.formTemplates).values({ slug: `v4-terms-${stamp}`, title: "שינוי תנאים", status: "active", publishedVersion: 1 }).returning();
    cleanup.push(() => db.delete(schema.formTemplates).where(eq(schema.formTemplates.id, tpl!.id)));
    await db.insert(schema.formTemplateVersions).values({ templateId: tpl!.id, version: 1, definition: termsChangeRequest });
    const [pkg] = await db
      .insert(schema.packageTemplates)
      .values({
        name: `v4-terms-${stamp}`,
        workflow: termsChangeWorkflow,
        expiryRule: { kind: "dayOfNextMonth", day: 4, dateFieldId: "start_work_date" },
        completionRecipients: [{ name: "חשבות", email: "payroll-docs@example.test" }],
        followUpStatuses: [{ key: "payroll", label: "עודכן בשכר" }],
      })
      .returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));
    await db.insert(schema.packageTemplateItems).values({ packageTemplateId: pkg!.id, templateId: tpl!.id, order: 1 });

    const id = await store.createRequest({
      packageTemplateId: pkg!.id,
      organizationId: org!.id,
      subject: { name: "דנה בדיקה", idNumber: termsChangeAnswers.id_number, email: termsChangeAnswers.email_address },
      requesterAnswers: termsChangeAnswers,
    });
    cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.id, id)));

    // Expiry: the 4th of the month after the start date (15.11.2026 → 4.12.2026).
    let r = (await store.getRequest(id))!;
    expect(new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jerusalem" }).format(r.request.expiresAt!)).toBe("2026-12-04");
    // Employee record, linked to the organization.
    expect(r.request.employeeId).toBeTruthy();
    const [emp] = await db.select().from(schema.employees).where(eq(schema.employees.id, r.request.employeeId!));
    expect(emp!.idNumber).toBe("000000018");
    cleanup.push(() => db.delete(schema.employees).where(eq(schema.employees.id, emp!.id)));
    const links = await db.select().from(schema.employeeOrganizations).where(eq(schema.employeeOrganizations.employeeId, emp!.id));
    expect(links.map((l) => l.organizationId)).toContain(org!.id);

    await store.sendRequest(id);
    r = (await store.getRequest(id))!;
    const employeeStep = r.steps.find((s) => s.role === "employee")!;
    expect(employeeStep.status).toBe("active");

    // The employee's signing page: no internal field, no internal answer.
    const { token, hash } = createToken();
    await db.insert(schema.stepTokens).values({ stepId: employeeStep.id, tokenHash: hash, expiresAt: r.request.expiresAt });
    const ctx = await loadByToken(token);
    expect(ctx.state).toBe("ok");
    if (ctx.state !== "ok") return;
    const ids = ctx.fullDefinition.pages.flatMap((p) => p.fields.map((f) => f.id));
    expect(ids).not.toContain("cost_center");
    expect(ids).not.toContain("department");
    expect(ctx.answers.cost_center).toBeUndefined();
    expect(ctx.answers.fname).toBe("דנה");

    // Employee → approver (from the "manager" field) → payroll.
    await store.applyStepAction(employeeStep.id, { type: "submit", answers: { employee_ack: true } });
    r = (await store.getRequest(id))!;
    const approver = r.steps.find((s) => s.role === "approver")!;
    expect(approver.assigneeEmail).toBe("approver@example.test");
    await store.applyStepAction(approver.id, { type: "submit", answers: {} });
    r = (await store.getRequest(id))!;
    await store.applyStepAction(r.steps.find((s) => s.role === "payroll")!.id, { type: "submit", answers: {} });
    r = (await store.getRequest(id))!;
    expect(r.request.status).toBe("completed");

    // Staff still have the internal answer.
    const all = await store.collectedAnswers(id);
    expect(all.cost_center).toBe("2001-100");

    // Completion recipients get one mail each.
    const docsMail = await db.select().from(schema.notifications).where(and(eq(schema.notifications.requestId, id), eq(schema.notifications.templateKey, "completion_docs")));
    expect(docsMail.map((m) => m.to)).toEqual(["payroll-docs@example.test"]);
    await store.enqueueCompletionDocs(id);
    expect((await db.select().from(schema.notifications).where(and(eq(schema.notifications.requestId, id), eq(schema.notifications.templateKey, "completion_docs")))).length).toBe(1);

    // Handling step after signing.
    const { markFollowUp } = await import("@/server/follow-up-store");
    await markFollowUp(id, "payroll", true, { id: undefined, name: "בדיקה" });
    r = (await store.getRequest(id))!;
    expect(r.request.followUp.payroll?.byName).toBe("בדיקה");
  });
});
