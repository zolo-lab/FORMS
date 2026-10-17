/**
 * Who may do what. Pure, so it is unit tested; `src/server/users-store.ts` loads the rows.
 *
 * - `admin` (אדמין) sees and may do everything.
 * - `manager` (מנהל) is the only other role. Per package a manager can be allowed to open requests, to see all
 *   requests of that package, and to edit the approval chain of requests they open. Independently, a manager
 *   can be limited to some of the organizations (nonprofits / businesses); no limit rows = all organizations.
 * - No signed-in user (open mode, or the shared password session of CI) behaves like an admin, as before.
 */
export type UserRole = "admin" | "manager";

/** The database enum still holds the old roles (payroll / approver / org_office); every one of them is a manager now. */
export const normalizeRole = (raw: string | null | undefined): UserRole => (raw === "admin" ? "admin" : "manager");

/** `null` = every organization; otherwise the ids a manager may work with (never empty). */
export type OrgAccess = string[] | null;

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
  admin: "אדמין",
  manager: "מנהל",
};

/** The first person to sign in runs the system; everyone after them starts as an ordinary user. */
export function roleForNewUser(existingUsers: number): UserRole {
  return existingUsers === 0 ? "admin" : "manager";
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

/** Organization ids a user may work with; `null` = all (admins, and managers without a limit). */
export function allowedOrgIds(u: SessionUser | null | undefined, orgIds: OrgAccess): OrgAccess {
  if (isAdmin(u)) return null;
  if (!u!.active) return [];
  return orgIds && orgIds.length ? orgIds : null;
}

export function orgAllowed(u: SessionUser | null | undefined, orgIds: OrgAccess, organizationId: string): boolean {
  const ids = allowedOrgIds(u, orgIds);
  return ids === null || ids.includes(organizationId);
}

export interface VisibilityScope {
  userId: string;
  email: string;
  viewAllPackageIds: string[];
  /** Limits the requests they opened and the packages they may view fully; a step addressed to them is always visible. `null` = no limit. */
  orgIds: OrgAccess;
}

/** What the dashboard shows a user: everything (null), or their own requests + packages they may view fully + steps addressed to them. */
export function visibilityScope(u: SessionUser | null | undefined, perms: PackagePermission[], orgIds: OrgAccess = null): VisibilityScope | null {
  if (isAdmin(u)) return null;
  return {
    userId: u!.id,
    email: u!.email.toLowerCase(),
    viewAllPackageIds: u!.active ? perms.filter((p) => p.canViewAll).map((p) => p.packageTemplateId) : [],
    orgIds: allowedOrgIds(u, orgIds),
  };
}
