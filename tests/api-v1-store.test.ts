/** Runs against the dev database; skipped when DATABASE_URL is not set. */
import { afterAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("API v1 service (dev DB)", () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => {});
  });

  async function setup() {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const { generateApiKey } = await import("@/lib/api/keys");
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const mkOrg = async (n: string) => {
      const [o] = await db.insert(schema.organizations).values({ name: `ארגון API ${n} ${stamp}`, registrationNumber: `A${n}${stamp}` }).returning();
      cleanup.push(() => db.delete(schema.organizations).where(eq(schema.organizations.id, o!.id)));
      const k = generateApiKey();
      await db.insert(schema.apiKeys).values({ organizationId: o!.id, name: `k${n}`, keyHash: k.hash });
      return { org: o!, key: k.key };
    };
    const a = await mkOrg("a");
    const b = await mkOrg("b");
    const [pkg] = await db
      .insert(schema.packageTemplates)
      .values({ name: `test-api-${stamp}`, organizationId: a.org.id, workflow: { steps: [{ order: 1, role: "employee", action: "fill_and_sign" }] } })
      .returning();
    cleanup.push(() => db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id)));
    return { db, schema, a, b, pkg: pkg! };
  }

  it("authenticates keys, scopes data to the organization and cancels", async () => {
    const { db, schema, a, b, pkg } = await setup();
    const { eq } = await import("drizzle-orm");
    const api = await import("@/server/api-v1");

    expect(await api.authenticate(null)).toBeNull();
    expect(await api.authenticate("Bearer fk_" + "x".repeat(43))).toBeNull();
    const authA = (await api.authenticate(`Bearer ${a.key}`))!;
    const authB = (await api.authenticate(`Bearer ${b.key}`))!;
    expect(authA.organizationId).toBe(a.org.id);

    // Validation errors don't create anything.
    const bad = await api.createApiRequest(authA.organizationId, { packageTemplateId: pkg.id, subject: { name: "" } });
    expect(bad).toMatchObject({ ok: false, status: 400 });

    // Another organization can't use organization A's package.
    expect(await api.createApiRequest(authB.organizationId, { packageTemplateId: pkg.id, subject: { name: "דנה", email: "d@example.test" } })).toMatchObject({ ok: false, status: 404 });

    const created = await api.createApiRequest(authA.organizationId, { packageTemplateId: pkg.id, subject: { name: "דנה כהן", email: "dana@example.test" }, apiParams: { crmId: 7 } });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.id, created.body.id)));
    expect(created.body.status).toBe("in_progress");
    expect(created.body.links).toHaveLength(1);
    expect(created.body.links[0]!.url).toMatch(/\/s\/[A-Za-z0-9_-]{43}$/);

    const got = await api.getApiRequest(authA.organizationId, created.body.id);
    expect(got?.subject.name).toBe("דנה כהן");
    expect(got?.steps).toHaveLength(1);
    expect(await api.getApiRequest(authB.organizationId, created.body.id)).toBeNull();

    const list = await api.listApiRequests(authA.organizationId, { status: "in_progress" });
    expect(list.requests.map((r) => r.id)).toContain(created.body.id);
    expect((await api.listApiRequests(authB.organizationId, {})).requests).toHaveLength(0);

    expect(await api.cancelApiRequest(authB.organizationId, created.body.id)).toBe("not_found");
    expect(await api.cancelApiRequest(authA.organizationId, created.body.id)).toBe("ok");
    expect(await api.cancelApiRequest(authA.organizationId, created.body.id)).toBe("conflict");

    // A revoked key stops working.
    await db.update(schema.apiKeys).set({ revokedAt: new Date() }).where(eq(schema.apiKeys.organizationId, a.org.id));
    expect(await api.authenticate(`Bearer ${a.key}`)).toBeNull();
  });

  it("send:false leaves a draft without links", async () => {
    const { db, schema, a, pkg } = await setup();
    const { eq } = await import("drizzle-orm");
    const api = await import("@/server/api-v1");
    const r = await api.createApiRequest(a.org.id, { packageTemplateId: pkg.id, subject: { name: "טיוטה" }, send: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    cleanup.push(() => db.delete(schema.requests).where(eq(schema.requests.id, r.body.id)));
    expect(r.body).toMatchObject({ status: "draft", links: [] });
  });
});
