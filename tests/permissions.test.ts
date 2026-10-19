import { describe, expect, it } from "vitest";
import { allowedOrgIds, can, canTrack, canViewContent, hasGrant, isTrackOnly, normalizeGrants, isAdmin, normalizeRole, openablePackageIds, orgAllowed, projectLimit, resolveAccess, roleForNewUser, usableOrgIds, visibilityScope, type PackagePermission, type SessionUser } from "@/lib/auth/permissions";

const admin: SessionUser = { id: "a", email: "a@x.org", name: "A", role: "admin", active: true };
const user: SessionUser = { id: "u", email: "U@x.org", name: "U", role: "manager", active: true };
const perms: PackagePermission[] = [
  { packageTemplateId: "p1", canOpen: true, canViewAll: false, canEditChain: true },
  { packageTemplateId: "p2", canOpen: false, canViewAll: true, canEditChain: true },
];

describe("roles", () => {
  it("first user is admin, the rest ordinary users", () => {
    expect(roleForNewUser(0)).toBe("admin");
    expect(roleForNewUser(1)).toBe("manager");
  });
  it("only admin and manager exist; the old stored roles all read as manager", () => {
    expect(normalizeRole("admin")).toBe("admin");
    for (const old of ["payroll", "approver", "org_office", "manager", "", null, undefined]) expect(normalizeRole(old)).toBe("manager");
  });
  it("no session (open mode / password) behaves like admin", () => {
    expect(isAdmin(null)).toBe(true);
    expect(can(undefined, [], "p9", "open")).toBe(true);
    expect(openablePackageIds(null, [])).toBeNull();
    expect(visibilityScope(null, [])).toBeNull();
  });
});

describe("can", () => {
  it("admin may do everything", () => {
    expect(can(admin, [], "p9", "edit_chain")).toBe(true);
  });
  it("user follows the rows", () => {
    expect(can(user, perms, "p1", "open")).toBe(true);
    expect(can(user, perms, "p1", "view_all")).toBe(false);
    expect(can(user, perms, "p1", "edit_chain")).toBe(true);
    expect(can(user, perms, "p2", "open")).toBe(false);
    expect(can(user, perms, "p2", "edit_chain")).toBe(false); // needs open too
    expect(can(user, perms, "p3", "open")).toBe(false);
  });
  it("inactive user may do nothing", () => {
    const off = { ...user, active: false };
    expect(can(off, perms, "p1", "open")).toBe(false);
    expect(openablePackageIds(off, perms)).toEqual([]);
    expect(visibilityScope(off, perms)?.viewAllPackageIds).toEqual([]);
  });
});

describe("scopes", () => {
  it("lists openable packages and the dashboard scope", () => {
    expect(openablePackageIds(user, perms)).toEqual(["p1"]);
    expect(visibilityScope(user, perms)).toEqual({ userId: "u", email: "u@x.org", viewAllPackageIds: ["p2"], allRequests: false, access: null });
  });
});

describe("organization and project access", () => {
  const P1 = { id: "p1", organizationId: "o2" };
  const P2 = { id: "p2", organizationId: "o2" };
  it("no rows = everywhere; an organization with ticked projects counts only through them", () => {
    expect(resolveAccess([], [])).toBeNull();
    expect(resolveAccess(["o1", "o2"], [P1])).toEqual({ orgs: ["o1"], projects: [P1] });
  });
  it("admin and open mode are never limited", () => {
    const a = resolveAccess(["o1"], []);
    expect(allowedOrgIds(admin, a)).toBeNull();
    expect(allowedOrgIds(null, a)).toBeNull();
    expect(orgAllowed(admin, a, "o9")).toBe(true);
  });
  it("a manager without rows may use every organization", () => {
    expect(allowedOrgIds(user, null)).toBeNull();
    expect(allowedOrgIds(user, { orgs: [], projects: [] })).toBeNull();
    expect(orgAllowed(user, null, "o9")).toBe(true);
  });
  it("whole organizations and single projects", () => {
    const a = resolveAccess(["o1"], [P1, P2]);
    expect(orgAllowed(user, a, "o1")).toBe(true);
    expect(orgAllowed(user, a, "o1", "anything")).toBe(true);
    expect(orgAllowed(user, a, "o2")).toBe(false); // needs one of its projects
    expect(orgAllowed(user, a, "o2", "p2")).toBe(true);
    expect(orgAllowed(user, a, "o2", "p9")).toBe(false);
    expect(orgAllowed(user, a, "o3", "p1")).toBe(false); // project of another organization
    expect(usableOrgIds(a)).toEqual(["o1", "o2"]);
    expect(projectLimit(a, "o1")).toBeNull();
    expect(projectLimit(a, "o2")).toEqual(["p1", "p2"]);
    expect(projectLimit(null, "o2")).toBeNull();
    expect(visibilityScope(user, perms, a)?.access).toEqual(a);
  });
  it("an inactive manager may use nothing", () => {
    const off = { ...user, active: false };
    expect(allowedOrgIds(off, null)).toEqual({ orgs: [], projects: [] });
    expect(orgAllowed(off, null, "o1")).toBe(false);
  });
});

describe("grants (iForms-style extra permissions)", () => {
  it("normalizes stored JSON", () => {
    expect(normalizeGrants(null)).toEqual({ viewAll: false, openAll: false, cancel: false, manageForms: false, export: false, followUp: false, trackOnly: false });
    expect(normalizeGrants({ export: true, cancel: "yes", junk: 1 })).toEqual({ viewAll: false, openAll: false, cancel: false, manageForms: false, export: true, followUp: false, trackOnly: false });
  });
  it("admin and open mode have every grant; a manager only what was ticked", () => {
    expect(hasGrant(admin, "export")).toBe(true);
    expect(hasGrant(null, "manageForms")).toBe(true);
    expect(hasGrant(user, "export")).toBe(false);
    expect(hasGrant({ ...user, grants: { export: true } }, "export")).toBe(true);
    expect(hasGrant({ ...user, active: false, grants: { export: true } }, "export")).toBe(false);
  });
  it("openAll opens every package, but editing the chain still needs the package row", () => {
    const u = { ...user, grants: { openAll: true } };
    expect(can(u, [], "p9", "open")).toBe(true);
    expect(can(u, [], "p9", "edit_chain")).toBe(false);
    expect(can(u, perms, "p2", "edit_chain")).toBe(true);
    expect(openablePackageIds(u, perms)).toBeNull();
  });
  it("viewAll shows every request (still within the organizations)", () => {
    const u = { ...user, grants: { viewAll: true } };
    expect(can(u, [], "p9", "view_all")).toBe(true);
    expect(visibilityScope(u, perms, { orgs: ["o1"], projects: [] })).toMatchObject({ allRequests: true, access: { orgs: ["o1"], projects: [] } });
    expect(visibilityScope({ ...u, active: false }, perms)?.allRequests).toBe(false);
  });
});

describe("tracking-only users", () => {
  const tracker: SessionUser = { id: "t", email: "t@users.invalid", name: "מזכירות", role: "manager", active: true, grants: { trackOnly: true, viewAll: true, export: true, openAll: true } };
  it("sees status but no content, opens and exports nothing", () => {
    expect(isTrackOnly(tracker)).toBe(true);
    expect(canViewContent(tracker)).toBe(false);
    expect(canTrack(tracker)).toBe(true);
    expect(hasGrant(tracker, "export")).toBe(false);
    expect(hasGrant(tracker, "viewAll")).toBe(false);
    expect(hasGrant(tracker, "trackOnly")).toBe(true);
    expect(can(tracker, [{ packageTemplateId: "p", canOpen: true, canViewAll: true, canEditChain: true }], "p", "open")).toBe(false);
    expect(openablePackageIds(tracker, [])).toEqual([]);
    expect(visibilityScope(tracker, [])?.allRequests).toBe(true);
  });
  it("admins are never tracking-only", () => {
    const admin: SessionUser = { id: "a", email: "a@x", name: "a", role: "admin", active: true, grants: { trackOnly: true } };
    expect(isTrackOnly(admin)).toBe(false);
    expect(canViewContent(admin)).toBe(true);
    expect(hasGrant(admin, "trackOnly")).toBe(false);
  });
  it("an ordinary manager may not track unless they see every request", () => {
    const m: SessionUser = { id: "m", email: "m@x", name: "m", role: "manager", active: true, grants: {} };
    expect(canTrack(m)).toBe(false);
    expect(canTrack({ ...m, grants: { viewAll: true } })).toBe(true);
  });
});
