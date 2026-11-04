/** Runs against the dev database; skipped when DATABASE_URL is not set. */
import { afterAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("deleteRequest (dev DB)", () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => {});
  });

  it("removes the request with its steps and events", async () => {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const store = await import("@/server/requests-store");
    const stamp = Date.now();
    const [org] = await db.insert(schema.organizations).values({ name: `ארגון מחיקה ${stamp}`, registrationNumber: `D${stamp}` }).returning();
    cleanup.push(() => db.delete(schema.organizations).where(eq(schema.organizations.id, org!.id)));
    const [pkg] = await db.insert(schema.packageTemplates).values({ name: `test-del-${stamp}`, workflow: { steps: [{ order: 1, role: "requester", action: "fill" }, { order: 2, role: "employee", action: "fill" }] } }).returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));
    const id = await store.createRequest({ packageTemplateId: pkg!.id, organizationId: org!.id, subject: { name: "עובד", email: "del@example.test" } });
    cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.id, id)));
    await store.sendRequest(id);
    expect((await db.select().from(schema.signingSteps).where(eq(schema.signingSteps.requestId, id))).length).toBeGreaterThan(0);

    await store.deleteRequest(id);
    expect(await store.getRequest(id)).toBeNull();
    expect(await db.select().from(schema.signingSteps).where(eq(schema.signingSteps.requestId, id))).toHaveLength(0);
    expect(await db.select().from(schema.events).where(eq(schema.events.requestId, id))).toHaveLength(0);
    await expect(store.deleteRequest(id)).rejects.toThrow();
  });
});
