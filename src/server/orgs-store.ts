import { and, asc, count, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { OrgInput } from "@/lib/orgs/input";
import { projectSlug } from "@/lib/forms/public-link";
import { labelKey } from "@/lib/forms/field-keys";
import { normalizeOrgFieldKey } from "@/lib/orgs/field-key";
import { suggestKey } from "@/lib/fields/key";
import { dictionaryType } from "@/lib/fields/types";
import { renameOrgFieldInDefinition } from "@/lib/orgs/rename-prefill";
import { ORG_FIELD_PREFIX } from "@/lib/forms/prefill";
import { db, schema } from "@/db";
import type { ReminderPolicy } from "@/lib/workflow/types";

const { formTemplateVersions, organizations, organizationFieldDefs, projects } = schema;

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

/** Every internal name in use: the organizations' fields and the central dictionary share one namespace. */
export async function takenFieldKeys(): Promise<Set<string>> {
  const [orgKeys, dictKeys] = await Promise.all([
    db.select({ key: organizationFieldDefs.key }).from(organizationFieldDefs),
    // Only a missing table (a database the migration has not reached) counts as empty; any other error must stop
    // the uniqueness check rather than let it pass silently.
    db.select({ key: schema.fieldDictionary.key }).from(schema.fieldDictionary).catch((e: unknown) => {
      const code = (e as { cause?: { code?: string }; code?: string }).cause?.code ?? (e as { code?: string }).code;
      if (code === "42P01") return [] as { key: string }[];
      throw e;
    }),
  ]);
  return new Set([...orgKeys, ...dictKeys].map((r) => r.key));
}

/**
 * Adds a field for ALL organizations at once: one definition, and every organization fills in its own value later.
 * People type the Hebrew name; the internal name (the key the forms point at) is made from it unless one is given,
 * and can be renamed later (`renameOrgFieldDef` moves the forms and the values with it).
 */
export async function createOrgFieldDef(input: { label: string; key?: string; type?: string }): Promise<{ ok: true; key: string } | { ok: false; reason: "key" | "exists" | "label" }> {
  const label = input.label.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!label) return { ok: false, reason: "label" };
  const taken = await takenFieldKeys();
  let key: string;
  if (input.key?.trim()) {
    const typed = normalizeOrgFieldKey(input.key);
    if (!typed) return { ok: false, reason: "key" };
    if ([...taken].some((k) => k.toLowerCase() === typed.toLowerCase())) return { ok: false, reason: "exists" };
    key = typed;
  } else key = suggestKey(label, taken);
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(organizationFieldDefs);
  await db.insert(organizationFieldDefs).values({ key, label, type: dictionaryType(input.type, true), order: Number(n) });
  return { ok: true, key };
}

/** The Hebrew name and the type of an organization field (the internal name has its own rename). */
export async function updateOrgFieldDef(id: string, patch: { label?: string; type?: string }) {
  const label = patch.label?.replace(/\s+/g, " ").trim().slice(0, 80);
  await db
    .update(organizationFieldDefs)
    .set({ ...(label ? { label } : {}), ...(patch.type !== undefined ? { type: dictionaryType(patch.type, true) } : {}), updatedAt: new Date() })
    .where(eq(organizationFieldDefs.id, id));
}

/**
 * Renames a field everywhere at once: the definition, the value every organization filled in for it, and every
 * form version that points at it (drafts and published alike, so published forms keep filling the same value).
 */
export async function renameOrgFieldDef(id: string, name: string): Promise<{ ok: true; forms: number } | { ok: false; reason: "key" | "exists" | "missing" }> {
  const to = normalizeOrgFieldKey(name);
  if (!to) return { ok: false, reason: "key" };
  const [row] = await db.select({ key: organizationFieldDefs.key }).from(organizationFieldDefs).where(eq(organizationFieldDefs.id, id));
  if (!row) return { ok: false, reason: "missing" };
  const from = row.key;
  if (from === to) return { ok: true, forms: 0 };
  const taken = await takenFieldKeys();
  taken.delete(from);
  if ([...taken].some((k) => k.toLowerCase() === to.toLowerCase())) return { ok: false, reason: "exists" };

  // The forms first: a form left on the old key would silently stop filling, while a form already moved to the new
  // key simply finds nothing until the values follow a moment later.
  const versions = await db
    .select({ id: formTemplateVersions.id, definition: formTemplateVersions.definition })
    .from(formTemplateVersions)
    .where(sql`${formTemplateVersions.definition}::text LIKE ${`%"${ORG_FIELD_PREFIX}${from}"%`}`);
  let forms = 0;
  for (const v of versions) {
    const next = renameOrgFieldInDefinition(v.definition, from, to);
    if (!next) continue;
    await db.update(formTemplateVersions).set({ definition: next }).where(eq(formTemplateVersions.id, v.id));
    forms++;
  }

  // Then the values of every organization, and last the definition itself.
  await db
    .update(organizations)
    .set({ fieldValues: sql`(${organizations.fieldValues} - ${from}) || jsonb_build_object(${to}::text, ${organizations.fieldValues} -> ${from})` })
    .where(sql`${organizations.fieldValues} ? ${from}`);
  // The Hebrew name stays; only a field that never had one (its name was the key) follows the new key.
  await db
    .update(organizationFieldDefs)
    .set({ key: to, label: sql`CASE WHEN ${organizationFieldDefs.label} = ${from} THEN ${to} ELSE ${organizationFieldDefs.label} END`, updatedAt: new Date() })
    .where(eq(organizationFieldDefs.id, id));
  return { ok: true, forms };
}

/** Drops a field everywhere, and the values the organizations filled in for it. */
export async function deleteOrgFieldDef(id: string) {
  const [row] = await db.select({ key: organizationFieldDefs.key }).from(organizationFieldDefs).where(eq(organizationFieldDefs.id, id));
  if (!row) return;
  // No transactions over neon-http: drop the values first. A failure then leaves everything as it was, and a
  // failure of the second write leaves a definition without values – never values waiting for a recreated key.
  await db.update(organizations).set({ fieldValues: sql`${organizations.fieldValues} - ${row.key}` });
  await db.delete(organizationFieldDefs).where(eq(organizationFieldDefs.id, id));
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
