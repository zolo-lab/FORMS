import { asc, eq } from "drizzle-orm";
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
  name: string;
  primaryColor: string | null;
  senderName: string | null;
  senderEmail: string | null;
  reminderPolicy: ReminderPolicy;
  logoFileId?: string | null;
}

export async function updateOrg(id: string, patch: OrgPatch) {
  await db.update(organizations).set(patch).where(eq(organizations.id, id));
}
