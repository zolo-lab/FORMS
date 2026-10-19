/** Signed-in users (filled from Google sign-in) and their per-package permissions. */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { db, schema } from "@/db";
import { SESSION_COOKIE, sessionEmail } from "@/lib/auth/session";
import { allowedOrgIds, isTrackOnly, resolveAccess, normalizeGrants, normalizeRole, openablePackageIds, roleForNewUser, visibilityScope, type OrgAccess, type PackagePermission, type SessionUser, type UserGrants, type UserRole } from "@/lib/auth/permissions";

const { users, packagePermissions, userOrganizations, userProjects, projects } = schema;

export type UserRow = typeof users.$inferSelect;

const toSession = (u: UserRow): SessionUser => ({ id: u.id, email: u.email, name: u.name, role: normalizeRole(u.role), active: u.active, grants: normalizeGrants(u.grants) });

/** Create the user on first sign-in (first ever = admin), or refresh the name. Returns the row. */
export async function upsertUserFromLogin(email: string, name: string): Promise<UserRow> {
  const e = email.toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, e));
  if (existing) {
    if (name && existing.name !== name && existing.name === e.split("@")[0]) {
      await db.update(users).set({ name, updatedAt: new Date() }).where(eq(users.id, existing.id));
      return { ...existing, name };
    }
    return existing;
  }
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  const [row] = await db
    .insert(users)
    .values({ email: e, name: name || e.split("@")[0]!, role: roleForNewUser(n) })
    .returning();
  return row!;
}

/**
 * The signed-in Google user of this request, or null for open mode / the shared password session
 * (both behave like an admin in `permissions.ts`). Cached per request.
 */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const email = await sessionEmail(process.env.SESSION_SECRET ?? "", token);
  if (!email) return null;
  const [row] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  return row ? toSession(row) : toSession(await upsertUserFromLogin(email, ""));
});

export const permissionsOf = cache(async (userId: string): Promise<PackagePermission[]> => {
  return db
    .select({ packageTemplateId: packagePermissions.packageTemplateId, canOpen: packagePermissions.canOpen, canViewAll: packagePermissions.canViewAll, canEditChain: packagePermissions.canEditChain })
    .from(packagePermissions)
    .where(eq(packagePermissions.userId, userId));
});

/** Where a manager is limited to (no rows = not limited): whole organizations and single projects. */
export const orgAccessOf = cache(async (userId: string): Promise<OrgAccess> => {
  const [orgRows, projectRows] = await Promise.all([
    db.select({ organizationId: userOrganizations.organizationId }).from(userOrganizations).where(eq(userOrganizations.userId, userId)),
    db
      .select({ id: projects.id, organizationId: projects.organizationId })
      .from(userProjects)
      .innerJoin(projects, eq(projects.id, userProjects.projectId))
      .where(eq(userProjects.userId, userId)),
  ]);
  return resolveAccess(orgRows.map((r) => r.organizationId), projectRows);
});

/** User + rows in one call, for pages and actions. `access` is already resolved: `null` = everywhere. */
export async function viewer(): Promise<{ user: SessionUser | null; perms: PackagePermission[]; access: OrgAccess }> {
  const user = await currentUser();
  if (!user) return { user, perms: [], access: null };
  const [perms, rows] = await Promise.all([permissionsOf(user.id), orgAccessOf(user.id)]);
  return { user, perms, access: allowedOrgIds(user, rows) };
}

export async function viewerOpenablePackages(): Promise<string[] | null> {
  const { user, perms } = await viewer();
  return openablePackageIds(user, perms);
}

export async function viewerScope() {
  const { user, perms, access } = await viewer();
  return visibilityScope(user, perms, access);
}

// ───────────────────────── Admin ─────────────────────────

export async function listUsers(): Promise<UserRow[]> {
  return db.select().from(users).orderBy(asc(users.name));
}

export async function setUserGrants(id: string, grants: UserGrants) {
  await db.update(users).set({ grants, updatedAt: new Date() }).where(eq(users.id, id));
}

export async function updateUser(id: string, patch: { role?: UserRole; active?: boolean }) {
  await db.update(users).set({ ...patch, updatedAt: new Date() }).where(eq(users.id, id));
}

export async function listAllPermissions(): Promise<(PackagePermission & { userId: string })[]> {
  return db
    .select({ userId: packagePermissions.userId, packageTemplateId: packagePermissions.packageTemplateId, canOpen: packagePermissions.canOpen, canViewAll: packagePermissions.canViewAll, canEditChain: packagePermissions.canEditChain })
    .from(packagePermissions);
}

export async function listAllOrgAccess(): Promise<{ userId: string; organizationId: string }[]> {
  return db.select({ userId: userOrganizations.userId, organizationId: userOrganizations.organizationId }).from(userOrganizations);
}

/** Replace the organizations a user is limited to; an empty list removes the limit (all organizations). */
export async function setUserOrgAccess(userId: string, organizationIds: string[]) {
  await db.delete(userOrganizations).where(eq(userOrganizations.userId, userId));
  if (organizationIds.length) await db.insert(userOrganizations).values(organizationIds.map((organizationId) => ({ userId, organizationId })));
}

export async function listAllProjectAccess(): Promise<{ userId: string; projectId: string }[]> {
  return db.select({ userId: userProjects.userId, projectId: userProjects.projectId }).from(userProjects);
}

/** Replace the single projects a user is limited to. */
export async function setUserProjectAccess(userId: string, projectIds: string[]) {
  await db.delete(userProjects).where(eq(userProjects.userId, userId));
  if (projectIds.length) await db.insert(userProjects).values(projectIds.map((projectId) => ({ userId, projectId })));
}

/** Replace a user's rows for the given packages (a row with all three false is removed). */
export async function setUserPermissions(userId: string, rows: PackagePermission[], packageIds: string[]) {
  if (packageIds.length) await db.delete(packagePermissions).where(and(eq(packagePermissions.userId, userId), inArray(packagePermissions.packageTemplateId, packageIds)));
  const keep = rows.filter((r) => r.canOpen || r.canViewAll || r.canEditChain);
  if (keep.length) await db.insert(packagePermissions).values(keep.map((r) => ({ ...r, userId })));
}

/** Whether the viewer may open one request page (admins always). */
export async function canSeeRequest(requestId: string): Promise<boolean> {
  // Tracking-only users never reach a request's content (answers, files, PDFs, links, actions on it).
  if (isTrackOnly(await currentUser())) return false;
  return inScope(requestId);
}

/** The request is in the viewer's scope for tracking (status only): trackers and everyone who may see it. */
export async function canTrackRequest(requestId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return false;
  return inScope(requestId);
}

async function inScope(requestId: string): Promise<boolean> {
  const scope = await viewerScope();
  if (!scope) return true;
  const { scopeCondition } = await import("./dashboard-store");
  const [row] = await db
    .select({ id: schema.requests.id })
    .from(schema.requests)
    .where(and(eq(schema.requests.id, requestId), scopeCondition(scope)));
  return !!row;
}

/** Active tracking-only users who may see this organization (no limit rows = every organization), with a real e-mail. */
export async function orgTrackers(organizationId: string): Promise<{ name: string; email: string }[]> {
  const rows = await db.select().from(users).where(eq(users.active, true));
  const trackers = rows.filter((u) => normalizeRole(u.role) !== "admin" && normalizeGrants(u.grants).trackOnly && !u.email.toLowerCase().endsWith("@users.invalid"));
  if (!trackers.length) return [];
  const limits = await db.select().from(userOrganizations).where(inArray(userOrganizations.userId, trackers.map((t) => t.id)));
  return trackers
    .filter((t) => {
      const mine = limits.filter((l) => l.userId === t.id);
      return mine.length === 0 || mine.some((l) => l.organizationId === organizationId);
    })
    .map((t) => ({ name: t.name, email: t.email }));
}
