import { describe, expect, it } from "vitest";
import { routeFor } from "@/lib/workflow/assignee";

describe("a route per organization", () => {
  const general = { steps: [{ order: 1, role: "employee" }] };
  const pnima = { steps: [{ order: 1, role: "employee" }, { order: 2, role: "approver" }] };
  it("an organization with its own route follows it; the others follow the general one", () => {
    const pkg = { workflow: general, orgWorkflows: { p: pnima } };
    expect(routeFor(pkg, "p")).toBe(pnima);
    expect(routeFor(pkg, "x")).toBe(general);
    expect(routeFor(pkg, null)).toBe(general);
    expect(routeFor({ workflow: general }, "p")).toBe(general);
  });
});

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("a route per organization (dev DB)", () => {
  it("a request of the organization goes through its route, others through the general one", async () => {
    const { db, schema } = await import("@/db");
    const { eq, inArray } = await import("drizzle-orm");
    const store = await import("@/server/requests-store");
    const stamp = Date.now();
    const made: string[] = [];
    const orgs = await db.insert(schema.organizations).values([{ name: `מסלול א ${stamp}`, registrationNumber: `RA${stamp}` }, { name: `מסלול ב ${stamp}`, registrationNumber: `RB${stamp}` }]).returning();
    const [a, b] = orgs;
    const [pkg] = await db
      .insert(schema.packageTemplates)
      .values({
        name: `מסלולים ${stamp}`,
        workflow: { steps: [{ order: 1, role: "employee", action: "fill_and_sign" }, { order: 2, role: "approver", action: "approve", assignee: { name: "כללי", email: `general-${stamp}@example.test` } }] },
        orgWorkflows: {
          [a!.id]: { steps: [{ order: 1, role: "employee", action: "fill_and_sign" }, { order: 2, role: "approver", action: "approve", assignee: { name: "מנהל א", email: `a-${stamp}@example.test` } }, { order: 3, role: "approver2", action: "approve", assignee: { name: "עוד שלב", email: `a2-${stamp}@example.test` } }] },
        },
      })
      .returning();
    try {
      const open = async (org: string) => {
        const id = await store.createRequest({ packageTemplateId: pkg!.id, organizationId: org, subject: { name: "עובד", email: `e-${stamp}@example.test` } });
        made.push(id);
        await store.sendRequest(id);
        return (await store.getRequest(id))!.steps.map((s) => `${s.role}:${s.assigneeEmail ?? ""}`);
      };
      expect(await open(a!.id)).toEqual([`employee:e-${stamp}@example.test`, `approver:a-${stamp}@example.test`, `approver2:a2-${stamp}@example.test`]);
      expect(await open(b!.id)).toEqual([`employee:e-${stamp}@example.test`, `approver:general-${stamp}@example.test`]);
    } finally {
      if (made.length) await db.delete(schema.requests).where(inArray(schema.requests.id, made));
      await db.delete(schema.packageTemplates).where(eq(schema.packageTemplates.id, pkg!.id));
      await db.delete(schema.organizations).where(inArray(schema.organizations.id, orgs.map((o) => o.id)));
    }
  });
});
