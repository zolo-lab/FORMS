/** Employee records: one row per ID number, linked to the organizations they work in, and to their requests. */
import { asc, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { normalizeIdNumber } from "@/lib/requests/employee";

const { employees, employeeOrganizations, requests, organizations, projects, packageTemplates } = schema;

/** Finds (or creates) the employee with this ID number and links them to the organization. Returns the id, or null without an ID number. */
export async function findOrCreateEmployee(input: { idNumber?: string | null; name: string; email?: string | null; phone?: string | null; organizationId: string; projectId?: string | null }): Promise<string | null> {
  const idNumber = normalizeIdNumber(input.idNumber);
  if (!idNumber) return null;
  const [found] = await db.select().from(employees).where(eq(employees.idNumber, idNumber));
  let id = found?.id;
  if (!found) {
    const [row] = await db
      .insert(employees)
      .values({ idNumber, name: input.name, email: input.email || null, phone: input.phone || null })
      .onConflictDoNothing()
      .returning({ id: employees.id });
    id = row?.id ?? (await db.select({ id: employees.id }).from(employees).where(eq(employees.idNumber, idNumber)))[0]?.id;
  } else {
    // Newer contact details win; the name is kept unless it was empty.
    const patch: Partial<typeof employees.$inferInsert> = {};
    if (input.email && input.email !== found.email) patch.email = input.email;
    if (input.phone && input.phone !== found.phone) patch.phone = input.phone;
    if (!found.name && input.name) patch.name = input.name;
    if (Object.keys(patch).length) await db.update(employees).set(patch).where(eq(employees.id, found.id));
  }
  if (!id) return null;
  await db
    .insert(employeeOrganizations)
    .values({ employeeId: id, organizationId: input.organizationId, projectId: input.projectId ?? null })
    .onConflictDoNothing();
  return id;
}

export interface EmployeeListRow {
  id: string;
  idNumber: string;
  name: string;
  organizations: string[];
  requests: number;
}

/** Employees for the list page; `orgIds` limits to employees of those organizations (null = all). */
export async function listEmployees(q: string | undefined, orgIds: string[] | null, limit = 200): Promise<EmployeeListRow[]> {
  const term = q?.trim();
  const where = term ? or(ilike(employees.name, `%${term}%`), ilike(employees.idNumber, `%${term}%`)) : undefined;
  const rows = await db.select().from(employees).where(where).orderBy(asc(employees.name)).limit(limit * 2);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const links = await db
    .select({ employeeId: employeeOrganizations.employeeId, orgId: organizations.id, org: organizations.name })
    .from(employeeOrganizations)
    .innerJoin(organizations, eq(organizations.id, employeeOrganizations.organizationId))
    .where(inArray(employeeOrganizations.employeeId, ids));
  const reqs = await db.select({ employeeId: requests.employeeId }).from(requests).where(inArray(requests.employeeId, ids));
  const out: EmployeeListRow[] = [];
  for (const r of rows) {
    const mine = links.filter((l) => l.employeeId === r.id);
    if (orgIds && !mine.some((l) => orgIds.includes(l.orgId))) continue;
    out.push({ id: r.id, idNumber: r.idNumber, name: r.name, organizations: mine.map((l) => l.org), requests: reqs.filter((x) => x.employeeId === r.id).length });
    if (out.length >= limit) break;
  }
  return out;
}

export async function getEmployee(id: string) {
  const [emp] = await db.select().from(employees).where(eq(employees.id, id));
  if (!emp) return null;
  const orgs = await db
    .select({ orgId: organizations.id, org: organizations.name, project: projects.name })
    .from(employeeOrganizations)
    .innerJoin(organizations, eq(organizations.id, employeeOrganizations.organizationId))
    .leftJoin(projects, eq(projects.id, employeeOrganizations.projectId))
    .where(eq(employeeOrganizations.employeeId, id));
  const reqs = await db
    .select({ id: requests.id, status: requests.status, createdAt: requests.createdAt, completedAt: requests.completedAt, organizationId: requests.organizationId, packageName: packageTemplates.name, orgName: organizations.name })
    .from(requests)
    .innerJoin(packageTemplates, eq(packageTemplates.id, requests.packageTemplateId))
    .innerJoin(organizations, eq(organizations.id, requests.organizationId))
    .where(eq(requests.employeeId, id))
    .orderBy(desc(requests.createdAt));
  return { employee: emp, organizations: orgs, requests: reqs };
}

/** Links existing requests (created before employee records existed) to employees by ID number. Returns how many were linked. */
export async function backfillEmployees(): Promise<number> {
  const rows = await db.select().from(requests);
  let linked = 0;
  for (const r of rows) {
    if (r.employeeId || !normalizeIdNumber(r.subjectIdNumber)) continue;
    const id = await findOrCreateEmployee({ idNumber: r.subjectIdNumber, name: r.subjectName, email: r.subjectEmail, phone: r.subjectPhone, organizationId: r.organizationId, projectId: r.projectId });
    if (id) {
      await db.update(requests).set({ employeeId: id }).where(eq(requests.id, r.id));
      linked++;
    }
  }
  return linked;
}
