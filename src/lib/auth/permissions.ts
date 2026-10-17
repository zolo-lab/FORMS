/**
 * Who may do what. Pure, so it is unit tested; `src/server/users-store.ts` loads the rows.
 *
 * - `admin` sees and may do everything.
 * - Every other role is an ordinary user: per package they can be allowed to open requests, to see all
 *   requests of that package, and to edit the approval chain of requests they open.
 * - No signed-in user (open mode, or the shared password session of CI) behaves like an admin, as before.
 */
export type UserRole = "admin" | "payroll" | "approver" | "org_office";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
}

export interface PackagePermission {
  packageTemplateId: string;
  canOpen: boolean;
  canViewAll: boolean;
  canEditChain: boolean;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "מנהל/ת מערכת",
  org_office: "משתמש/ת",
  approver: "מאשר/ת",
  payroll: "שכר",
};

/** The first person to sign in runs the system; everyone after them starts as an ordinary user. */
export function roleForNewUser(existingUsers: number): UserRole {
  return existingUsers === 0 ? "admin" : "org_office";
}

export const isAdmin = (u: SessionUser | null | undefined): boolean => !u || u.role === "admin";

export type Ability = "open" | "view_all" | "edit_chain";

export function can(u: SessionUser | null | undefined, perms: PackagePermission[], packageTemplateId: string, ability: Ability): boolean {
  if (isAdmin(u)) return true;
  if (!u!.active) return false;
  const p = perms.find((x) => x.packageTemplateId === packageTemplateId);
  if (!p) return false;
  switch (ability) {
    case "open":
      return p.canOpen;
    case "view_all":
      return p.canViewAll;
    case "edit_chain":
      return p.canOpen && p.canEditChain;
  }
}

/** Package ids a user may start requests of; `null` = all (admin). */
export function openablePackageIds(u: SessionUser | null | undefined, perms: PackagePermission[]): string[] | null {
  if (isAdmin(u)) return null;
  if (!u!.active) return [];
  return perms.filter((p) => p.canOpen).map((p) => p.packageTemplateId);
}

/** What the dashboard shows a user: everything (null), or their own requests + packages they may view fully + steps addressed to them. */
export function visibilityScope(u: SessionUser | null | undefined, perms: PackagePermission[]): { userId: string; email: string; viewAllPackageIds: string[] } | null {
  if (isAdmin(u)) return null;
  return { userId: u!.id, email: u!.email.toLowerCase(), viewAllPackageIds: u!.active ? perms.filter((p) => p.canViewAll).map((p) => p.packageTemplateId) : [] };
}
