import { describe, expect, it } from "vitest";
import { can, isAdmin, openablePackageIds, roleForNewUser, visibilityScope, type PackagePermission, type SessionUser } from "@/lib/auth/permissions";

const admin: SessionUser = { id: "a", email: "a@x.org", name: "A", role: "admin", active: true };
const user: SessionUser = { id: "u", email: "U@x.org", name: "U", role: "org_office", active: true };
const perms: PackagePermission[] = [
  { packageTemplateId: "p1", canOpen: true, canViewAll: false, canEditChain: true },
  { packageTemplateId: "p2", canOpen: false, canViewAll: true, canEditChain: true },
];

describe("roles", () => {
  it("first user is admin, the rest ordinary users", () => {
    expect(roleForNewUser(0)).toBe("admin");
    expect(roleForNewUser(1)).toBe("org_office");
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
    expect(visibilityScope(user, perms)).toEqual({ userId: "u", email: "u@x.org", viewAllPackageIds: ["p2"] });
  });
});
