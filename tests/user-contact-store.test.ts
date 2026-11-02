/** Runs against the dev database; skipped when DATABASE_URL is not set. Its user and contact are removed at the end. */
import { afterAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("a user's contact follows the user (dev DB)", () => {
  const cleanup: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn().catch(() => {});
  });

  it("changing the e-mail moves the same contact to the new address (no duplicate)", async () => {
    const { db, schema } = await import("@/db");
    const { eq, inArray } = await import("drizzle-orm");
    const { saveUserDetails } = await import("@/server/user-admin");
    const stamp = Date.now();
    const oldEmail = `old-${stamp}@example.test`;
    const newEmail = `new-${stamp}@example.test`;
    cleanup.push(() => db.delete(schema.contacts).where(inArray(schema.contacts.email, [oldEmail, newEmail])));

    const created = await saveUserDetails({ name: "משתמש מעבר", email: oldEmail, role: "manager", active: true, phone: null });
    expect(created.ok).toBe(true);
    const id = (created as { id: string }).id;
    cleanup.push(() => db.delete(schema.users).where(eq(schema.users.id, id)));
    const [before] = await db.select().from(schema.contacts).where(eq(schema.contacts.email, oldEmail));

    await saveUserDetails({ id, name: "משתמש מעבר", email: newEmail, role: "manager", active: true, phone: null });
    const rows = await db.select().from(schema.contacts).where(inArray(schema.contacts.email, [oldEmail, newEmail]));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(before!.id);
    expect(rows[0]!.email).toBe(newEmail);
  });
});
