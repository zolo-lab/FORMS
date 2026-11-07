/** Runs against the dev database; skipped when DATABASE_URL is not set. */
import { afterAll, describe, expect, it } from "vitest";
import { endOfDayIsrael } from "@/lib/requests/expiry";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("a step's own link expiry (dev DB)", () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => {});
  });

  it("dates the step's link from its rule, honours the organization's exception, and expires by it", async () => {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const store = await import("@/server/requests-store");
    const stamp = Date.now();
    const orgs = await db.insert(schema.organizations).values([
      { name: `ארגון תוקף א ${stamp}`, registrationNumber: `EA${stamp}` },
      { name: `ארגון תוקף ב ${stamp}`, registrationNumber: `EB${stamp}` },
    ]).returning();
    const [general, special] = [orgs[0]!, orgs[1]!];
    cleanup.push(() => db.delete(schema.organizations).where(eq(schema.organizations.id, general.id)));
    cleanup.push(() => db.delete(schema.organizations).where(eq(schema.organizations.id, special.id)));
    const [pkg] = await db.insert(schema.packageTemplates).values({
      name: `test-expiry-${stamp}`,
      workflow: {
        steps: [
          { order: 1, role: "requester", action: "fill" },
          {
            order: 2, role: "employee", action: "fill",
            expiry: { kind: "dayOfNextMonth", day: 7, dateFieldId: "start" },
            expiryByOrg: { [special.id]: { kind: "dayOfMonth", day: 20, dateFieldId: "start" } },
          },
        ],
      },
    }).returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));

    const open = async (organizationId: string) => {
      const id = await store.createRequest({ packageTemplateId: pkg!.id, organizationId, subject: { name: "עובד", email: `exp${stamp}@example.test` }, requesterAnswers: { start: "2030-01-05" } });
      cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.id, id)));
      await store.sendRequest(id);
      const [step] = await db.select().from(schema.signingSteps).where(eq(schema.signingSteps.requestId, id)).then((r) => r.filter((s) => s.role === "employee"));
      const [token] = await db.select().from(schema.stepTokens).where(eq(schema.stepTokens.stepId, step!.id));
      return { id, step: step!, token: token! };
    };

    // The general rule: the 7th of the month after the start date.
    const a = await open(general.id);
    expect(a.step.ownLinkExpiry).toBe(true);
    expect(a.step.linkExpiresAt).toEqual(endOfDayIsrael(2030, 2, 7));
    expect(a.token.expiresAt).toEqual(endOfDayIsrael(2030, 2, 7));

    // The organization's exception: the 20th on or after the start date.
    const b = await open(special.id);
    expect(b.step.linkExpiresAt).toEqual(endOfDayIsrael(2030, 1, 20));

    // The step's own deadline passing expires the request, even though the request's own date is later.
    await db.update(schema.signingSteps).set({ linkExpiresAt: new Date(Date.now() - 60_000) }).where(eq(schema.signingSteps.id, a.step.id));
    await db.update(schema.requests).set({ expiresAt: new Date(Date.now() + 30 * 86_400_000) }).where(eq(schema.requests.id, a.id));
    await store.expireOverdue();
    expect((await store.getRequest(a.id))!.request.status).toBe("expired");
    expect((await store.getRequest(b.id))!.request.status).toBe("in_progress");
  });
});
