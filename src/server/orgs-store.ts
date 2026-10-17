import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { OrgInput } from "@/lib/orgs/input";
import { db, schema } from "@/db";
import type { ReminderPolicy } from "@/lib/workflow/types";

const { organizations, projects } = schema;

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

// ───────────────────────── Projects ─────────────────────────

export type ProjectRow = typeof projects.$inferSelect;

/**
 * 6.17 kept one project name on the organization row; projects now have their own table.
 * Moves any such name into `projects` once (idempotent) and clears the old column.
 */
async function moveLegacyProjects() {
  const legacy = await db.select({ id: organizations.id, projectName: organizations.projectName }).from(organizations).where(isNotNull(organizations.projectName));
  for (const o of legacy) {
    if (o.projectName?.trim()) await db.insert(projects).values({ organizationId: o.id, name: o.projectName.trim() }).onConflictDoNothing();
    await db.update(organizations).set({ projectName: null }).where(eq(organizations.id, o.id));
  }
}

export async function listProjects(): Promise<ProjectRow[]> {
  await moveLegacyProjects();
  return db.select().from(projects).orderBy(asc(projects.name));
}

/** Returns false when the organization already has a project with this name. */
export async function createProject(organizationId: string, name: string): Promise<boolean> {
  const [dup] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.organizationId, organizationId), eq(projects.name, name)));
  if (dup) return false;
  await db.insert(projects).values({ organizationId, name });
  return true;
}

export async function updateProject(id: string, patch: { name: string; active: boolean }): Promise<boolean> {
  const [row] = await db.select().from(projects).where(eq(projects.id, id));
  if (!row) return false;
  const [dup] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.organizationId, row.organizationId), eq(projects.name, patch.name)));
  if (dup && dup.id !== id) return false;
  await db.update(projects).set(patch).where(eq(projects.id, id));
  return true;
}
