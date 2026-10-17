/** Signed-in users (filled from Google sign-in) and their per-package permissions. */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { db, schema } from "@/db";
import { SESSION_COOKIE, sessionEmail } from "@/lib/auth/session";
import { openablePackageIds, roleForNewUser, visibilityScope, type PackagePermission, type SessionUser, type UserRole } from "@/lib/auth/permissions";

const { users, packagePermissions } = schema;

export type UserRow = typeof users.$inferSelect;

const toSession = (u: UserRow): SessionUser => ({ id: u.id, email: u.email, name: u.name, role: u.role, active: u.active });

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

/** User + rows in one call, for pages and actions. */
export async function viewer(): Promise<{ user: SessionUser | null; perms: PackagePermission[] }> {
  const user = await currentUser();
  return { user, perms: user ? await permissionsOf(user.id) : [] };
}

export async function viewerOpenablePackages(): Promise<string[] | null> {
  const { user, perms } = await viewer();
  return openablePackageIds(user, perms);
}

export async function viewerScope() {
  const { user, perms } = await viewer();
  return visibilityScope(user, perms);
}

// ───────────────────────── Admin ─────────────────────────

export async function listUsers(): Promise<UserRow[]> {
  return db.select().from(users).orderBy(asc(users.name));
}

export async function updateUser(id: string, patch: { role?: UserRole; active?: boolean }) {
  await db.update(users).set({ ...patch, updatedAt: new Date() }).where(eq(users.id, id));
}

export async function listAllPermissions(): Promise<(PackagePermission & { userId: string })[]> {
  return db
    .select({ userId: packagePermissions.userId, packageTemplateId: packagePermissions.packageTemplateId, canOpen: packagePermissions.canOpen, canViewAll: packagePermissions.canViewAll, canEditChain: packagePermissions.canEditChain })
    .from(packagePermissions);
}

/** Replace a user's rows for the given packages (a row with all three false is removed). */
export async function setUserPermissions(userId: string, rows: PackagePermission[], packageIds: string[]) {
  if (packageIds.length) await db.delete(packagePermissions).where(and(eq(packagePermissions.userId, userId), inArray(packagePermissions.packageTemplateId, packageIds)));
  const keep = rows.filter((r) => r.canOpen || r.canViewAll || r.canEditChain);
  if (keep.length) await db.insert(packagePermissions).values(keep.map((r) => ({ ...r, userId })));
}

/** Whether the viewer may open one request page (admins always). */
export async function canSeeRequest(requestId: string): Promise<boolean> {
  const scope = await viewerScope();
  if (!scope) return true;
  const { scopeCondition } = await import("./dashboard-store");
  const [row] = await db
    .select({ id: schema.requests.id })
    .from(schema.requests)
    .where(and(eq(schema.requests.id, requestId), scopeCondition(scope)));
  return !!row;
}
