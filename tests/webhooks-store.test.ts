/** Runs against the dev database; skipped when DATABASE_URL is not set. */
import { afterAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("webhooks (dev DB)", () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => {});
  });

  async function completedRequest() {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const store = await import("@/server/requests-store");
    const stamp = Date.now();
    const [org] = await db.insert(schema.organizations).values({ name: `ארגון webhooks ${stamp}`, registrationNumber: `W${stamp}` }).returning();
    cleanup.push(() => db.delete(schema.organizations).where(eq(schema.organizations.id, org!.id)));
    const [pkg] = await db.insert(schema.packageTemplates).values({ name: `test-wh-${stamp}`, workflow: { steps: [{ order: 1, role: "requester", action: "fill" }] } }).returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));
    const id = await store.createRequest({ packageTemplateId: pkg!.id, organizationId: org!.id, subject: { name: "עובד", email: "wh@example.test" }, requesterAnswers: { salary: 9000 } });
    cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.id, id)));
    await store.sendRequest(id);
    return { db, schema, org: org!, id };
  }

  it("delivers a signed request.completed payload to matching hooks only", async () => {
    const { db, schema, org, id } = await completedRequest();
    const wh = await import("@/server/webhooks");
    const { verifyWebhook } = await import("@/lib/webhooks/sign");
    const a = await wh.createWebhook({ organizationId: org.id, templateId: null, url: "https://receiver.example.test/a", events: ["request.completed"] });
    await wh.createWebhook({ organizationId: org.id, templateId: null, url: "https://receiver.example.test/b", events: ["step.completed"] });
    const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
    const sent = await wh.emitWebhooks(id, [{ type: "request_completed" }, { type: "step_opened" }], {
      fetchImpl: async (url, init) => (calls.push({ url, headers: init.headers, body: init.body }), { ok: true, status: 200 }),
    });
    expect(sent).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://receiver.example.test/a");
    const c = calls[0]!;
    expect(verifyWebhook(a.secret, { timestamp: c.headers["x-forms-timestamp"]!, signature: c.headers["x-forms-signature"]! }, c.body)).toBe(true);
    const payload = JSON.parse(c.body);
    expect(payload.event).toBe("request.completed");
    expect(payload.request.id).toBe(id);
    expect(payload.request.subject.name).toBe("עובד");
    expect(payload.answers.salary).toBe(9000);
    expect(Array.isArray(payload.documents)).toBe(true);
    expect((await db.select().from(schema.events)).some((e) => e.type === "webhook_failed" && e.requestId === id)).toBe(false);
  });

  it("retries 5xx, logs a failure event after the last attempt, and doesn't retry a 4xx", async () => {
    const { db, schema, org, id } = await completedRequest();
    const { eq } = await import("drizzle-orm");
    const wh = await import("@/server/webhooks");
    await wh.createWebhook({ organizationId: org.id, templateId: null, url: "https://receiver.example.test/fail", events: ["request.completed"] });
    let n = 0;
    await wh.emitWebhooks(id, [{ type: "request_completed" }], { delays: [0, 0, 0], fetchImpl: async () => (n++, { ok: false, status: 503 }) });
    expect(n).toBe(3);
    const failed = (await db.select().from(schema.events).where(eq(schema.events.requestId, id))).filter((e) => e.type === "webhook_failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]!.payload).toMatchObject({ event: "request.completed", status: 503, attempts: 3 });

    n = 0;
    await wh.emitWebhooks(id, [{ type: "request_completed" }], { delays: [0, 0, 0], fetchImpl: async () => (n++, { ok: false, status: 400 }) });
    expect(n).toBe(1);
  });
});
