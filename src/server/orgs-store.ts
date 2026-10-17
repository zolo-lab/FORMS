import { asc, eq } from "drizzle-orm";
import type { OrgInput } from "@/lib/orgs/input";
import { db, schema } from "@/db";
import type { ReminderPolicy } from "@/lib/workflow/types";

const { organizations } = schema;

export async function listOrgs() {
  return db.select().from(organizations).orderBy(asc(organizations.name));
}

export async function getOrgBySlug(slug: string) {
  const [o] = await db.select().from(organizations).where(eq(organizations.slug, slug));
  return o ?? null;
}

export interface OrgPatch {
  name?: string;
  primaryColor: string | null;
  senderName: string | null;
  senderEmail: string | null;
  reminderPolicy: ReminderPolicy;
  logoFileId?: string | null;
}

export async function updateOrg(id: string, patch: OrgPatch) {
  await db.update(organizations).set(patch).where(eq(organizations.id, id));
}

/** Adds a nonprofit / business. Returns null when the registration number is already used. */
export async function createOrg(input: OrgInput): Promise<{ id: string } | null> {
  const [dup] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.registrationNumber, input.registrationNumber));
  if (dup) return null;
  const [row] = await db.insert(organizations).values(input).returning({ id: organizations.id });
  return row!;
}

/** Name, registration number and project of one row. Returns false when the number belongs to another organization. */
export async function updateOrgBasics(id: string, input: OrgInput): Promise<boolean> {
  const [dup] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.registrationNumber, input.registrationNumber));
  if (dup && dup.id !== id) return false;
  await db.update(organizations).set(input).where(eq(organizations.id, id));
  return true;
}

export async function setOrgActive(id: string, active: boolean) {
  await db.update(organizations).set({ active }).where(eq(organizations.id, id));
}
