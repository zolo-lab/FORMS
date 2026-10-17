import { describe, expect, it } from "vitest";
import { allowedOrgIds, can, hasGrant, normalizeGrants, isAdmin, normalizeRole, openablePackageIds, orgAllowed, roleForNewUser, visibilityScope, type PackagePermission, type SessionUser } from "@/lib/auth/permissions";

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
    expect(visibilityScope(user, perms)).toEqual({ userId: "u", email: "u@x.org", viewAllPackageIds: ["p2"], allRequests: false, orgIds: null });
  });
});

describe("organization access", () => {
  it("admin and open mode are never limited", () => {
    expect(allowedOrgIds(admin, ["o1"])).toBeNull();
    expect(allowedOrgIds(null, ["o1"])).toBeNull();
    expect(orgAllowed(admin, ["o1"], "o9")).toBe(true);
  });
  it("a manager without rows may use every organization", () => {
    expect(allowedOrgIds(user, null)).toBeNull();
    expect(allowedOrgIds(user, [])).toBeNull();
    expect(orgAllowed(user, null, "o9")).toBe(true);
  });
  it("a manager with rows is limited to them", () => {
    expect(allowedOrgIds(user, ["o1", "o2"])).toEqual(["o1", "o2"]);
    expect(orgAllowed(user, ["o1", "o2"], "o2")).toBe(true);
    expect(orgAllowed(user, ["o1", "o2"], "o3")).toBe(false);
    expect(visibilityScope(user, perms, ["o1"])?.orgIds).toEqual(["o1"]);
  });
  it("an inactive manager may use no organization", () => {
    const off = { ...user, active: false };
    expect(allowedOrgIds(off, null)).toEqual([]);
    expect(orgAllowed(off, null, "o1")).toBe(false);
  });
});

describe("grants (iForms-style extra permissions)", () => {
  it("normalizes stored JSON", () => {
    expect(normalizeGrants(null)).toEqual({ viewAll: false, openAll: false, cancel: false, manageForms: false, export: false });
    expect(normalizeGrants({ export: true, cancel: "yes", junk: 1 })).toEqual({ viewAll: false, openAll: false, cancel: false, manageForms: false, export: true });
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
    expect(visibilityScope(u, perms, ["o1"])).toMatchObject({ allRequests: true, orgIds: ["o1"] });
    expect(visibilityScope({ ...u, active: false }, perms)?.allRequests).toBe(false);
  });
});
