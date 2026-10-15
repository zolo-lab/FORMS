/** Contacts and groups: the people a step can be routed to, and the dropdowns that pick one of them. */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { allFields, type FormDefinition } from "@/lib/forms/schema";
import type { Lookups } from "@/lib/forms/lookups";
import { STATIC_LOOKUPS } from "@/lib/forms/lookups";
import { GROUP_SOURCE_PREFIX, groupIdOfSource } from "@/lib/workflow/assignee";
import type { PeopleDirectory, Person, Workflow } from "@/lib/workflow/types";

const { contacts, groups, groupMembers } = schema;

export type ContactRow = typeof contacts.$inferSelect;
export type GroupRow = typeof groups.$inferSelect;

const toPerson = (c: ContactRow): Person => ({ id: c.id, name: c.name, email: c.email ?? undefined, phone: c.phone ?? undefined });

export async function listContacts(includeInactive = false): Promise<ContactRow[]> {
  const q = db.select().from(contacts).orderBy(asc(contacts.name));
  return includeInactive ? q : q.where(eq(contacts.active, true));
}

export async function listGroups(): Promise<(GroupRow & { memberIds: string[] })[]> {
  const gs = await db.select().from(groups).orderBy(asc(groups.name));
  if (!gs.length) return [];
  const ms = await db.select().from(groupMembers).where(inArray(groupMembers.groupId, gs.map((g) => g.id)));
  return gs.map((g) => ({ ...g, memberIds: ms.filter((m) => m.groupId === g.id).map((m) => m.contactId) }));
}

export async function createContact(input: { name: string; email?: string | null; phone?: string | null; kind: "internal" | "external"; organizationId?: string | null }) {
  const [row] = await db.insert(contacts).values({ name: input.name, email: input.email || null, phone: input.phone || null, kind: input.kind, organizationId: input.organizationId ?? null }).returning();
  return row!;
}

export async function updateContact(id: string, patch: Partial<{ name: string; email: string | null; phone: string | null; kind: "internal" | "external"; active: boolean; organizationId: string | null }>) {
  await db.update(contacts).set({ ...patch, updatedAt: new Date() }).where(eq(contacts.id, id));
}

export async function createGroup(name: string, organizationId: string | null = null) {
  const [row] = await db.insert(groups).values({ name, organizationId }).returning();
  return row!;
}

export async function renameGroup(id: string, name: string) {
  await db.update(groups).set({ name, updatedAt: new Date() }).where(eq(groups.id, id));
}

export async function deleteGroup(id: string) {
  await db.delete(groups).where(eq(groups.id, id));
}

export async function setGroupMembers(groupId: string, contactIds: string[]) {
  await db.delete(groupMembers).where(eq(groupMembers.groupId, groupId));
  if (contactIds.length) await db.insert(groupMembers).values(contactIds.map((contactId) => ({ groupId, contactId })));
}

export async function addGroupMember(groupId: string, contactId: string) {
  await db.insert(groupMembers).values({ groupId, contactId }).onConflictDoNothing();
}

export async function removeGroupMember(groupId: string, contactId: string) {
  await db.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.contactId, contactId)));
}

/** Active members of each group, keyed by group id. */
async function membersOf(groupIds: string[]): Promise<Record<string, Person[]>> {
  const out: Record<string, Person[]> = {};
  if (!groupIds.length) return out;
  const rows = await db
    .select({ groupId: groupMembers.groupId, c: contacts })
    .from(groupMembers)
    .innerJoin(contacts, eq(contacts.id, groupMembers.contactId))
    .where(and(inArray(groupMembers.groupId, groupIds), eq(contacts.active, true)))
    .orderBy(asc(contacts.name));
  for (const id of groupIds) out[id] = [];
  for (const r of rows) out[r.groupId]!.push(toPerson(r.c));
  return out;
}

/**
 * Everyone a workflow may route to: the contacts and groups named in its steps, plus the members of every group
 * that an answer field lists (so a chosen contact id resolves to a person).
 */
export async function peopleForWorkflow(workflow: Workflow, definitions: FormDefinition[] = []): Promise<PeopleDirectory> {
  const contactIds = new Set<string>();
  const groupIds = new Set<string>();
  for (const s of workflow.steps) {
    if (s.contactId) contactIds.add(s.contactId);
    if (s.groupId) groupIds.add(s.groupId);
  }
  for (const def of definitions) for (const f of allFields(def)) {
    const g = groupIdOfSource(f.optionsSource);
    if (g) groupIds.add(g);
  }
  const byGroup = await membersOf([...groupIds]);
  const direct = contactIds.size ? await db.select().from(contacts).where(inArray(contacts.id, [...contactIds])) : [];
  const all: Record<string, Person> = {};
  for (const c of direct) all[c.id] = toPerson(c);
  for (const members of Object.values(byGroup)) for (const m of members) all[m.id!] = m;
  return { contacts: all, groups: byGroup };
}

/** Option lists for every `group:<id>` field of a form: value = contact id, label = name. */
export async function lookupsFor(definitions: FormDefinition[]): Promise<Lookups> {
  const ids = new Set<string>();
  for (const def of definitions) for (const f of allFields(def)) {
    const g = groupIdOfSource(f.optionsSource);
    if (g) ids.add(g);
  }
  const byGroup = await membersOf([...ids]);
  const out: Lookups = { ...STATIC_LOOKUPS };
  for (const [id, members] of Object.entries(byGroup)) out[`${GROUP_SOURCE_PREFIX}${id}`] = members.map((m) => ({ value: m.id!, label: m.name }));
  return out;
}
