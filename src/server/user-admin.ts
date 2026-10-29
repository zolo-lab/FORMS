/**
 * The "משתמשים" area: system users (אדמין / מנהל) and groups of managers.
 * A step in a form is routed to a contact (see people-store), so every user has a matching contact (same e-mail, or
 * the same name for a user without a real address). Groups keep contact members; here they are chosen as users.
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { UserRole } from "@/lib/auth/permissions";
import { setGroupMembers } from "./people-store";
import type { UserRow } from "./users-store";

const { users, contacts, groups, groupMembers } = schema;

const realEmail = (email: string) => (email.endsWith("@users.invalid") ? null : email.toLowerCase());

/** The contact that stands for a user in steps and groups, created or refreshed (name, phone, active). */
export async function contactForUser(u: Pick<UserRow, "name" | "email" | "active">, phone?: string | null): Promise<string> {
  const email = realEmail(u.email);
  const [found] = email
    ? await db.select().from(contacts).where(sql`lower(${contacts.email}) = ${email}`).limit(1)
    : await db.select().from(contacts).where(and(isNull(contacts.email), eq(contacts.name, u.name))).limit(1);
  if (found) {
    await db
      .update(contacts)
      .set({ name: u.name, active: u.active, ...(phone !== undefined ? { phone } : {}), updatedAt: new Date() })
      .where(eq(contacts.id, found.id));
    return found.id;
  }
  const [row] = await db.insert(contacts).values({ name: u.name, email, phone: phone ?? null, kind: "internal", active: u.active }).returning({ id: contacts.id });
  return row!.id;
}

/** Contacts of all users, by user id (no row = the user has no contact yet). */
export async function userContacts(list: UserRow[]): Promise<Map<string, { id: string; phone: string | null }>> {
  const all = await db.select().from(contacts);
  const out = new Map<string, { id: string; phone: string | null }>();
  for (const u of list) {
    const email = realEmail(u.email);
    const c = all.find((x) => (email ? x.email?.toLowerCase() === email : !x.email && x.name === u.name));
    if (c) out.set(u.id, { id: c.id, phone: c.phone });
  }
  return out;
}

export async function getUser(id: string): Promise<UserRow | null> {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u ?? null;
}

export type SaveUserResult = { ok: true; id: string } | { ok: false; error: "exists" };

/** Creates (no `id`) or updates a user's details, and keeps their contact in step with them. */
export async function saveUserDetails(input: { id?: string; name: string; email: string; role: UserRole; active: boolean; phone: string | null }): Promise<SaveUserResult> {
  const email = input.email.toLowerCase();
  const [taken] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`);
  if (taken && taken.id !== input.id) return { ok: false, error: "exists" };
  let id = input.id;
  if (id) {
    await db.update(users).set({ name: input.name, email, role: input.role, active: input.active, updatedAt: new Date() }).where(eq(users.id, id));
  } else {
    const [row] = await db.insert(users).values({ name: input.name, email, role: input.role, active: input.active }).returning({ id: users.id });
    id = row!.id;
  }
  await contactForUser({ name: input.name, email, active: input.active }, input.phone);
  return { ok: true, id };
}

/** Groups with the users in them (members that are contacts of no user are kept as they are). */
export async function listUserGroups(list: UserRow[]) {
  const gs = await db.select().from(groups).orderBy(asc(groups.name));
  const ms = gs.length ? await db.select().from(groupMembers).where(inArray(groupMembers.groupId, gs.map((g) => g.id))) : [];
  const byUser = await userContacts(list);
  const userOfContact = new Map([...byUser].map(([userId, c]) => [c.id, userId]));
  return gs.map((g) => {
    const contactIds = ms.filter((m) => m.groupId === g.id).map((m) => m.contactId);
    return { id: g.id, name: g.name, userIds: contactIds.map((c) => userOfContact.get(c)).filter((u): u is string => !!u), otherContactIds: contactIds.filter((c) => !userOfContact.has(c)) };
  });
}

/** Sets a group's members to these users (each through their contact), keeping members that are not users. */
export async function setGroupUsers(groupId: string, userIds: string[], keepContactIds: string[]) {
  const chosen = userIds.length ? await db.select().from(users).where(inArray(users.id, userIds)) : [];
  const contactIds = await Promise.all(chosen.map((u) => contactForUser(u)));
  await setGroupMembers(groupId, [...new Set([...contactIds, ...keepContactIds])]);
}
