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
            expiry: { kind: "calc" as const, base: { from: "field" as const, fieldId: "start" }, snap: { day: 7, mode: "next" as const } },
            expiryByOrg: { [special.id]: { kind: "calc" as const, base: { from: "field" as const, fieldId: "start" }, snap: { day: 20, mode: "sameOrNext" as const } } },
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

    // Extending it opens it again: the step is active with a fresh link that lasts the extension from now.
    const t0 = Date.now();
    await store.extendExpiry(a.id, 5);
    const again = (await store.getRequest(a.id))!;
    expect(again.request.status).toBe("in_progress");
    const [stepNow] = await db.select().from(schema.signingSteps).where(eq(schema.signingSteps.id, a.step.id));
    expect(stepNow!.status).toBe("active");
    const ends = stepNow!.linkExpiresAt!.getTime();
    expect(ends).toBeGreaterThanOrEqual(t0 + 5 * 86_400_000);
    expect(ends).toBeLessThan(t0 + 5 * 86_400_000 + 120_000);
    const live = (await db.select().from(schema.stepTokens).where(eq(schema.stepTokens.stepId, a.step.id))).filter((t) => !t.revokedAt);
    expect(live.length).toBeGreaterThan(0);
    expect(live.every((t) => t.expiresAt?.getTime() === ends)).toBe(true);

    // An organization's own route: only its steps' own rule counts, never a leftover exception.
    await db.update(schema.packageTemplates).set({
      orgWorkflows: {
        [special.id]: {
          steps: [
            { order: 1, role: "requester", action: "fill" },
            { order: 2, role: "employee", action: "fill", expiry: { kind: "none" }, expiryByOrg: { [special.id]: { kind: "calc" as const, base: { from: "field" as const, fieldId: "start" }, snap: { day: 20, mode: "sameOrNext" as const } } } },
          ],
        },
      },
    }).where(eq(schema.packageTemplates.id, pkg!.id));
    const c = await open(special.id);
    expect(c.step.ownLinkExpiry).toBe(true);
    expect(c.step.linkExpiresAt).toBeNull();
    expect(c.token.expiresAt).toBeNull();
  });
  it("a rule that compares with today is worked out again as the days pass, unless the request was extended", async () => {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const store = await import("@/server/requests-store");
    const stamp = Date.now();
    const [org] = await db.insert(schema.organizations).values({ name: `ארגון היום ${stamp}`, registrationNumber: `ET${stamp}` }).returning();
    cleanup.push(() => db.delete(schema.organizations).where(eq(schema.organizations.id, org!.id)));
    // Start date 12 days from now. If it is within 10 days of today: 5 days from the step's start; otherwise the 7th
    // of the month after it.
    const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);
    const start = ymd(new Date(stamp + 12 * 86_400_000));
    const [pkg] = await db.insert(schema.packageTemplates).values({
      name: `test-expiry-today-${stamp}`,
      workflow: {
        steps: [
          { order: 1, role: "requester", action: "fill" },
          {
            order: 2, role: "employee", action: "fill",
            expiry: {
              kind: "cases" as const,
              cases: [{ when: { type: "today" as const, fieldId: "start", op: "within" as const, days: 10 }, then: { kind: "calc" as const, base: { from: "stepStart" as const }, addDays: 5 } }],
              otherwise: { kind: "calc" as const, base: { from: "field" as const, fieldId: "start" }, snap: { day: 7, mode: "next" as const } },
            },
          },
        ],
      },
    }).returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));
    const id = await store.createRequest({ packageTemplateId: pkg!.id, organizationId: org!.id, subject: { name: "עובד", email: `today${stamp}@example.test` }, requesterAnswers: { start } });
    cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.id, id)));
    await store.sendRequest(id);
    const stepOf = async () => (await db.select().from(schema.signingSteps).where(eq(schema.signingSteps.requestId, id))).find((s) => s.role === "employee")!;
    const first = await stepOf();
    const [y, m] = start.split("-").map(Number) as [number, number];
    expect(first.linkExpiresAt).toEqual(endOfDayIsrael(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 7));

    // Three days later the start date is within 10 days: the deadline moves to 5 days from the step's start.
    await store.expireOverdue(new Date(stamp + 3 * 86_400_000));
    const moved = await stepOf();
    expect(moved.linkExpiresAt).toEqual(new Date(first.activatedAt!.getTime() + 5 * 86_400_000));
    const tokens = (await db.select().from(schema.stepTokens).where(eq(schema.stepTokens.stepId, first.id))).filter((t) => !t.revokedAt);
    expect(tokens.every((t) => t.expiresAt?.getTime() === moved.linkExpiresAt!.getTime())).toBe(true);
    expect((await store.getRequest(id))!.request.status).toBe("in_progress");

    // An admin's extension stands: the rule no longer moves it.
    await store.extendExpiry(id, 20);
    const extended = (await stepOf()).linkExpiresAt!;
    await store.expireOverdue(new Date(stamp + 4 * 86_400_000));
    expect((await stepOf()).linkExpiresAt).toEqual(extended);
  });
});
