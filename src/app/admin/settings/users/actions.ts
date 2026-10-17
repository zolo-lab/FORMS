"use server";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { GRANT_KEYS, isAdmin, type PackagePermission, type UserGrants, type UserRole } from "@/lib/auth/permissions";
import { db, schema } from "@/db";
import { hashPassword, isDemoAddress, validDemoPassword } from "@/lib/auth/password";
import { RETURN_COOKIE, SESSION_COOKIE, SESSION_TTL_MS, createUserSessionToken, sessionEmail } from "@/lib/auth/session";
import { currentUser, setUserGrants, setUserOrgAccess, setUserPermissions, updateUser } from "@/server/users-store";

const cookieOpts = (maxAge: number) => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge });

const PATH = "/admin/settings/users";
const UUID = /^[0-9a-f-]{36}$/i;
const ROLES: UserRole[] = ["admin", "manager"];

async function requireAdmin() {
  if (!isAdmin(await currentUser())) redirect("/admin/forms");
}

export async function updateUserAction(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const role = String(fd.get("role") ?? "") as UserRole;
  if (!UUID.test(id) || !ROLES.includes(role)) redirect(`${PATH}?error=input`);
  const me = await currentUser();
  // An admin cannot lock themselves out.
  if (me?.id === id && (role !== "admin" || !fd.get("active"))) redirect(`${PATH}?error=self`);
  await updateUser(id, { role, active: !!fd.get("active") });
  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}

/**
 * One form per user: checkboxes named `<packageId>.open|view|chain`, plus `packages` = every package id shown;
 * `orgScope` = "all" | "some" with `orgs` = the organizations ticked, and `grant.<key>` checkboxes (see GRANT_KEYS).
 */
export async function savePermissionsAction(fd: FormData) {
  await requireAdmin();
  const userId = String(fd.get("userId") ?? "");
  const packageIds = fd.getAll("packages").map(String).filter((p) => UUID.test(p));
  if (!UUID.test(userId)) redirect(`${PATH}?error=input`);
  const orgIds = fd.getAll("orgs").map(String).filter((o) => UUID.test(o));
  // "Only some" with nothing ticked would silently mean "all": refuse it instead.
  if (fd.get("orgScope") === "some" && orgIds.length === 0) redirect(`${PATH}?error=orgs&u=${userId}`);
  await setUserOrgAccess(userId, fd.get("orgScope") === "some" ? orgIds : []);
  const grants = Object.fromEntries(GRANT_KEYS.map((k) => [k, fd.get(`grant.${k}`) === "on"])) as unknown as UserGrants;
  await setUserGrants(userId, grants);
  const rows: PackagePermission[] = packageIds.map((p) => ({
    packageTemplateId: p,
    canOpen: !!fd.get(`${p}.open`),
    canViewAll: !!fd.get(`${p}.view`),
    canEditChain: !!fd.get(`${p}.chain`),
  }));
  await setUserPermissions(userId, rows, packageIds);
  revalidatePath(PATH);
  redirect(`${PATH}?saved=1&u=${userId}`);
}

/** Demo/test user with an invented address (@demo.test…) and a password; nothing is ever sent to the address. */
export async function createDemoUserAction(fd: FormData) {
  await requireAdmin();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const name = String(fd.get("name") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const role = String(fd.get("role") ?? "manager") as UserRole;
  if (!name || !isDemoAddress(email) || (password && !validDemoPassword(password)) || !ROLES.includes(role)) redirect(`${PATH}?error=demo`);
  const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
  if (exists) redirect(`${PATH}?error=exists`);
  await db.insert(schema.users).values({ email, name, role, passwordHash: password ? hashPassword(password) : null });
  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}

export async function setPasswordAction(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const password = String(fd.get("password") ?? "");
  const [u] = UUID.test(id) ? await db.select().from(schema.users).where(eq(schema.users.id, id)) : [];
  if (!u || !isDemoAddress(u.email) || !validDemoPassword(password)) redirect(`${PATH}?error=demo`);
  await db.update(schema.users).set({ passwordHash: hashPassword(password), updatedAt: new Date() }).where(eq(schema.users.id, id));
  redirect(`${PATH}?saved=1`);
}

/** Admin: act as another user (to see the process through their eyes). The admin's own session is kept for the way back. */
export async function impersonateAction(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const [u] = UUID.test(id) ? await db.select().from(schema.users).where(eq(schema.users.id, id)) : [];
  const secret = process.env.SESSION_SECRET;
  if (!u || !u.active || !secret) redirect(`${PATH}?error=input`);
  const jar = await cookies();
  // Keep the first (real) admin session if we are already acting as someone.
  if (!jar.get(RETURN_COOKIE)) jar.set(RETURN_COOKIE, jar.get(SESSION_COOKIE)?.value || "open", cookieOpts(SESSION_TTL_MS / 1000));
  jar.set(SESSION_COOKIE, await createUserSessionToken(secret, u.email), cookieOpts(SESSION_TTL_MS / 1000));
  redirect("/admin/requests");
}

export async function stopImpersonatingAction() {
  const jar = await cookies();
  const back = jar.get(RETURN_COOKIE)?.value;
  const secret = process.env.SESSION_SECRET ?? "";
  if (back === "open") jar.delete(SESSION_COOKIE);
  else if (back) {
    // Only ever restore a session that really belongs to an admin.
    const email = await sessionEmail(secret, back);
    const [u] = email ? await db.select().from(schema.users).where(eq(schema.users.email, email)) : [];
    if (u?.role === "admin") jar.set(SESSION_COOKIE, back, cookieOpts(SESSION_TTL_MS / 1000));
    else if (!email) jar.set(SESSION_COOKIE, back, cookieOpts(SESSION_TTL_MS / 1000)); // the shared-password admin session
  }
  jar.delete(RETURN_COOKIE);
  redirect("/admin/settings/users");
}
