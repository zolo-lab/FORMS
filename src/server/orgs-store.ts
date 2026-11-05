import { and, asc, count, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { OrgInput } from "@/lib/orgs/input";
import { projectSlug } from "@/lib/forms/public-link";
import { labelKey } from "@/lib/forms/field-keys";
import { orgFieldKeyFromLabel } from "@/lib/orgs/field-key";
import { db, schema } from "@/db";
import type { ReminderPolicy } from "@/lib/workflow/types";

const { organizations, organizationFieldDefs, projects } = schema;

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
  reminderPolicy?: ReminderPolicy;
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
  const rows = await db.select().from(projects).orderBy(asc(projects.name));
  // Projects made before short names existed get one, once.
  for (const p of rows.filter((r) => !r.slug)) {
    const taken = rows.filter((r) => r.organizationId === p.organizationId && r.slug).map((r) => r.slug!);
    p.slug = projectSlug(p.name, taken, labelKey);
    await db.update(projects).set({ slug: p.slug }).where(eq(projects.id, p.id));
  }
  return rows;
}

/** Returns false when the organization already has a project with this name. */
export async function createProject(organizationId: string, name: string): Promise<boolean> {
  const [dup] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.organizationId, organizationId), eq(projects.name, name)));
  if (dup) return false;
  const taken = (await db.select({ slug: projects.slug }).from(projects).where(eq(projects.organizationId, organizationId))).map((r) => r.slug).filter((x): x is string => !!x);
  await db.insert(projects).values({ organizationId, name, slug: projectSlug(name, taken, labelKey) });
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

/** How many requests and employees are filed under each project (a project in use is better switched off than deleted). */
export async function projectUsage(): Promise<Map<string, number>> {
  const [reqs, emps] = await Promise.all([
    db.select({ id: schema.requests.projectId, n: count() }).from(schema.requests).where(isNotNull(schema.requests.projectId)).groupBy(schema.requests.projectId),
    db.select({ id: schema.employeeOrganizations.projectId, n: count() }).from(schema.employeeOrganizations).where(isNotNull(schema.employeeOrganizations.projectId)).groupBy(schema.employeeOrganizations.projectId),
  ]);
  const out = new Map<string, number>();
  for (const r of [...reqs, ...emps]) if (r.id) out.set(r.id, (out.get(r.id) ?? 0) + Number(r.n));
  return out;
}

/** Deletes a project nothing is filed under. Returns how many requests/employees use it otherwise (and deletes nothing). */
export async function deleteProject(id: string): Promise<{ ok: true } | { ok: false; inUse: number }> {
  const used = (await projectUsage()).get(id) ?? 0;
  if (used) return { ok: false, inUse: used };
  await db.delete(projects).where(eq(projects.id, id));
  return { ok: true };
}

export async function setOrgsActive(ids: string[], active: boolean) {
  if (ids.length) await db.update(organizations).set({ active }).where(inArray(organizations.id, ids));
}

// ───────────────────────── The organizations' own fields ─────────────────────────

export type OrgFieldDef = typeof organizationFieldDefs.$inferSelect;

/** Every organization field, in the order an admin put them in. */
export async function listOrgFieldDefs(): Promise<OrgFieldDef[]> {
  return db.select().from(organizationFieldDefs).orderBy(asc(organizationFieldDefs.order), asc(organizationFieldDefs.label));
}

/**
 * Adds a field for ALL organizations at once: one definition, and every organization fills in its own value later.
 * The key is derived from the label (so the forms can point at it) and must be free.
 */
export async function createOrgFieldDef(label: string): Promise<{ ok: true; key: string } | { ok: false; reason: "label" | "exists" }> {
  const clean = label.trim();
  if (!clean) return { ok: false, reason: "label" };
  const key = orgFieldKeyFromLabel(clean);
  const [dup] = await db.select({ id: organizationFieldDefs.id }).from(organizationFieldDefs).where(eq(organizationFieldDefs.key, key));
  if (dup) return { ok: false, reason: "exists" };
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(organizationFieldDefs);
  await db.insert(organizationFieldDefs).values({ key, label: clean, order: Number(n) });
  return { ok: true, key };
}

/** Renames a field for everyone. The key never changes, so forms pointing at it keep working. */
export async function renameOrgFieldDef(id: string, label: string): Promise<boolean> {
  const clean = label.trim();
  if (!clean) return false;
  await db.update(organizationFieldDefs).set({ label: clean, updatedAt: new Date() }).where(eq(organizationFieldDefs.id, id));
  return true;
}

/** Drops a field everywhere, and the values the organizations filled in for it. */
export async function deleteOrgFieldDef(id: string) {
  const [row] = await db.select({ key: organizationFieldDefs.key }).from(organizationFieldDefs).where(eq(organizationFieldDefs.id, id));
  if (!row) return;
  await db.delete(organizationFieldDefs).where(eq(organizationFieldDefs.id, id));
  await db.update(organizations).set({ fieldValues: sql`${organizations.fieldValues} - ${row.key}` });
}

/** One organization's values, by key. Keys without a definition are dropped on the way in. */
export async function setOrgFieldValues(id: string, values: Record<string, string>) {
  const defs = await listOrgFieldDefs();
  const known = new Set(defs.map((d) => d.key));
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    const text = v.trim();
    if (known.has(k) && text) clean[k] = text;
  }
  await db.update(organizations).set({ fieldValues: clean }).where(eq(organizations.id, id));
}
