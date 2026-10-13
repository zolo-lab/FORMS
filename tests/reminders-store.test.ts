/** Runs against the dev database; skipped when DATABASE_URL is not set. */
import { afterAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("runReminders (dev DB)", () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => {});
  });

  it("queues exactly maxCount reminders with fresh links and never kills the original link", async () => {
    const { db, schema } = await import("@/db");
    const { and, eq } = await import("drizzle-orm");
    const store = await import("@/server/requests-store");
    const { runReminders } = await import("@/server/reminders");
    const stamp = Date.now();
    // Permissive policy (no quiet hours, no Shabbat), so the test doesn't depend on the clock.
    const [org] = await db
      .insert(schema.organizations)
      .values({ name: `ארגון תזכורות ${stamp}`, registrationNumber: `R${stamp}`, reminderPolicy: { firstAfterHours: 1, everyHours: 1, maxCount: 2, quietFromHour: 0, quietToHour: 0, skipShabbat: false } })
      .returning();
    cleanup.push(() => db.delete(schema.organizations).where(eq(schema.organizations.id, org!.id)));
    const [pkg] = await db
      .insert(schema.packageTemplates)
      .values({ name: `test-rem-${stamp}`, workflow: { steps: [{ order: 1, role: "employee", action: "fill" }] } })
      .returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));
    const id = await store.createRequest({ packageTemplateId: pkg!.id, organizationId: org!.id, subject: { name: "עובד", email: "rem@example.test" } });
    cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.id, id)));
    await store.sendRequest(id);
    const step = (await store.getRequest(id))!.steps[0]!;

    const count = async () => (await db.select().from(schema.notifications).where(and(eq(schema.notifications.stepId, step.id), eq(schema.notifications.templateKey, "reminder")))).length;
    await runReminders(new Date(), { organizationId: org!.id });
    expect(await count()).toBe(0); // activated just now

    await db.update(schema.signingSteps).set({ activatedAt: new Date(Date.now() - 3 * 3_600_000) }).where(eq(schema.signingSteps.id, step.id));
    await runReminders(new Date(), { organizationId: org!.id });
    expect(await count()).toBe(1);
    await runReminders(new Date(), { organizationId: org!.id }); // the next one is an hour away
    expect(await count()).toBe(1);

    // Pretend the first reminder went out 2 hours ago.
    await db.update(schema.notifications).set({ createdAt: new Date(Date.now() - 2 * 3_600_000) }).where(and(eq(schema.notifications.stepId, step.id), eq(schema.notifications.templateKey, "reminder")));
    await runReminders(new Date(), { organizationId: org!.id });
    expect(await count()).toBe(2);
    await db.update(schema.notifications).set({ createdAt: new Date(Date.now() - 5 * 3_600_000) }).where(and(eq(schema.notifications.stepId, step.id), eq(schema.notifications.templateKey, "reminder")));
    await runReminders(new Date(), { organizationId: org!.id });
    expect(await count()).toBe(2); // maxCount reached

    // The invite link and the two reminder links are all still valid.
    const tokens = await db.select().from(schema.stepTokens).where(eq(schema.stepTokens.stepId, step.id));
    expect(tokens).toHaveLength(3);
    expect(tokens.every((t) => t.revokedAt === null)).toBe(true);
  });
});
