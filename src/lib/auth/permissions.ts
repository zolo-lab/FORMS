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

/**
 * Where a manager may work. `null` = everywhere. Otherwise: whole organizations (`orgs`) plus single projects
 * (`projects`); an organization reached only through projects is limited to those projects.
 */
export interface Access {
  orgs: string[];
  projects: { id: string; organizationId: string }[];
}
export type OrgAccess = Access | null;

const NOWHERE: Access = { orgs: [], projects: [] };

/** Stored rows to an access: no rows = everywhere; an organization with ticked projects counts only through them. */
export function resolveAccess(orgRows: string[], projectRows: { id: string; organizationId: string }[]): OrgAccess {
  if (orgRows.length === 0 && projectRows.length === 0) return null;
  const viaProjects = new Set(projectRows.map((p) => p.organizationId));
  return { orgs: orgRows.filter((o) => !viaProjects.has(o)), projects: projectRows };
}

/** Organization ids that appear in pickers (whole ones and those reached through a project); `null` = all. */
export function usableOrgIds(access: OrgAccess): string[] | null {
  if (!access) return null;
  return [...new Set([...access.orgs, ...access.projects.map((p) => p.organizationId)])];
}

/** For one organization: `null` = any project (or none); a list = only these projects, and one of them is required. */
export function projectLimit(access: OrgAccess, organizationId: string): string[] | null {
  if (!access || access.orgs.includes(organizationId)) return null;
  return access.projects.filter((p) => p.organizationId === organizationId).map((p) => p.id);
}

/** Extra permissions an admin can tick for a manager (like iForms). Admins have all of them. */
export interface UserGrants {
  /** Sees every request (within their organizations), not only their own. */
  viewAll: boolean;
  /** May open requests from every package. */
  openAll: boolean;
  /** May cancel requests and delete drafts. */
  cancel: boolean;
  /** May build forms and packages. */
  manageForms: boolean;
  /** May export to Excel / CSV and download the signed PDFs. */
  export: boolean;
}

export const GRANT_KEYS = ["viewAll", "openAll", "cancel", "manageForms", "export"] as const satisfies readonly (keyof UserGrants)[];

export const GRANT_LABELS: Record<keyof UserGrants, string> = {
  viewAll: "רואה את כל הבקשות (לא רק את שלו)",
  openAll: "רשאי לפתוח בקשות מכל הערכות",
  cancel: "יכול לבטל בקשות ולמחוק טיוטות",
  manageForms: "יכול לבנות טפסים וערכות",
  export: "רשאי לייצא דוחות (Excel / CSV / PDF חתומים)",
};

/** Stored JSON (possibly partial or junk) to a full set of booleans. */
export function normalizeGrants(raw: unknown): UserGrants {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { viewAll: o.viewAll === true, openAll: o.openAll === true, cancel: o.cancel === true, manageForms: o.manageForms === true, export: o.export === true };
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  grants?: Partial<UserGrants>;
}

/** Admins (and open mode) have every grant; an inactive user none. */
export function hasGrant(u: SessionUser | null | undefined, grant: keyof UserGrants): boolean {
  if (isAdmin(u)) return true;
  return u!.active && u!.grants?.[grant] === true;
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
  const openAll = u!.grants?.openAll === true;
  switch (ability) {
    case "open":
      return openAll || !!p?.canOpen;
    case "view_all":
      return u!.grants?.viewAll === true || !!p?.canViewAll;
    case "edit_chain":
      return (openAll || !!p?.canOpen) && !!p?.canEditChain;
  }
}

/** Package ids a user may start requests of; `null` = all (admin). */
export function openablePackageIds(u: SessionUser | null | undefined, perms: PackagePermission[]): string[] | null {
  if (isAdmin(u)) return null;
  if (!u!.active) return [];
  if (u!.grants?.openAll) return null;
  return perms.filter((p) => p.canOpen).map((p) => p.packageTemplateId);
}

/** The access that applies to a user: `null` = everywhere (admins, and managers without a limit); inactive = nowhere. */
export function allowedOrgIds(u: SessionUser | null | undefined, access: OrgAccess): OrgAccess {
  if (isAdmin(u)) return null;
  if (!u!.active) return NOWHERE;
  return access && (access.orgs.length || access.projects.length) ? access : null;
}

/** May the user work in this organization (and project)? */
export function orgAllowed(u: SessionUser | null | undefined, access: OrgAccess, organizationId: string, projectId?: string | null): boolean {
  const a = allowedOrgIds(u, access);
  if (a === null || a.orgs.includes(organizationId)) return true;
  return !!projectId && a.projects.some((p) => p.id === projectId && p.organizationId === organizationId);
}

export interface VisibilityScope {
  userId: string;
  email: string;
  viewAllPackageIds: string[];
  /** The "sees every request" grant: all requests (still within `access`). */
  allRequests: boolean;
  /** Limits the requests they opened and the packages they may view fully; a step addressed to them is always visible. `null` = no limit. */
  access: OrgAccess;
}

/** What the dashboard shows a user: everything (null), or their own requests + packages they may view fully + steps addressed to them. */
export function visibilityScope(u: SessionUser | null | undefined, perms: PackagePermission[], access: OrgAccess = null): VisibilityScope | null {
  if (isAdmin(u)) return null;
  return {
    userId: u!.id,
    email: u!.email.toLowerCase(),
    viewAllPackageIds: u!.active ? perms.filter((p) => p.canViewAll).map((p) => p.packageTemplateId) : [],
    allRequests: u!.active && u!.grants?.viewAll === true,
    access: allowedOrgIds(u, access),
  };
}
