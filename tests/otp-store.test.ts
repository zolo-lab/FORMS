/** Runs against the dev database; skipped when DATABASE_URL is not set. */
import { afterAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("OTP brute-force limits (dev DB)", () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => {});
  });

  async function setup() {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const store = await import("@/server/requests-store");
    const [org] = await db.select().from(schema.organizations).limit(1);
    const [pkg] = await db
      .insert(schema.packageTemplates)
      .values({
        name: `test-otp-${Date.now()}`,
        workflow: { steps: [{ order: 1, role: "approver", action: "approve", otpRequired: true, assignee: { name: "מאשר", email: "otp@example.test" } }] },
      })
      .returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));
    const id = await store.createRequest({ packageTemplateId: pkg!.id, organizationId: org!.id, subject: { name: "עובד" } });
    cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.id, id)));
    await store.sendRequest(id);
    const r = (await store.getRequest(id))!;
    const step = r.steps[0]!;
    await db.update(schema.signingSteps).set({ otpRequired: true }).where(eq(schema.signingSteps.id, step.id));
    const link = (await store.issueLink(step.id))!;
    return { token: link.url.split("/s/")[1]!, stepId: step.id, db, schema, eq };
  }

  it("parallel wrong guesses never exceed the attempt cap, and the right code is then refused", async () => {
    const { token, stepId, db, schema, eq } = await setup();
    const signing = await import("@/server/signing");
    const sent = await signing.sendOtp(token);
    expect(sent.ok).toBe(true);
    const guesses = await Promise.all(Array.from({ length: 20 }, (_, i) => signing.verifyOtp(token, String(100000 + i))));
    const checked = guesses.filter((g) => !g.ok && g.reason !== "locked");
    expect(checked.length).toBeLessThanOrEqual(5);
    expect(guesses.some((g) => !g.ok && g.reason === "locked")).toBe(true);
    const [row] = await db.select().from(schema.signingSteps).where(eq(schema.signingSteps.id, stepId));
    expect(row!.otpAttempts).toBe(5);
  });

  it("limits how many codes can be requested per day", async () => {
    const { token, stepId, db, schema, eq } = await setup();
    const signing = await import("@/server/signing");
    const { OTP_MAX_SENDS_PER_DAY } = await import("@/lib/auth/otp");
    for (let i = 0; i < OTP_MAX_SENDS_PER_DAY; i++) {
      // Skip the 60 s cooldown between sends.
      await db.update(schema.signingSteps).set({ otpExpiresAt: null }).where(eq(schema.signingSteps.id, stepId));
      expect((await signing.sendOtp(token)).ok).toBe(true);
    }
    await db.update(schema.signingSteps).set({ otpExpiresAt: null }).where(eq(schema.signingSteps.id, stepId));
    const over = await signing.sendOtp(token);
    expect(over).toEqual({ ok: false, reason: "daily_limit" });
  });
});
