"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { GRANT_KEYS, type PackagePermission, type UserGrants, type UserRole } from "@/lib/auth/permissions";
import { isValidEmail, isValidIsraeliPhone, normalizeIsraeliPhone } from "@/lib/validators/israeli";
import { requireAdmin } from "@/server/guards";
import { listProjects } from "@/server/orgs-store";
import { createGroup, deleteGroup, renameGroup } from "@/server/people-store";
import { saveUserDetails, setGroupUsers } from "@/server/user-admin";
import type { SaveUserState } from "./[id]/UserForm";
import { currentUser, permissionsOf, setUserGrants, setUserOrgAccess, setUserPermissions, setUserProjectAccess } from "@/server/users-store";

const PATH = "/admin/users";
const UUID = /^[0-9a-f-]{36}$/i;
const ROLES: UserRole[] = ["admin", "manager"];
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/**
 * One form for everything about a user (new when `id` is empty): details, type, and for a manager the extra
 * permissions, the forms they may send/see, and the organizations. No password here: sign-in is set up separately.
 *
 * A refusal is RETURNED, never redirected to: the form stays on screen with everything the admin already typed
 * and ticked (losing the rest of the form over one bad phone number is the bug this shape prevents).
 */
export async function saveUserAction(_prev: SaveUserState | null, fd: FormData): Promise<SaveUserState | null> {
  await requireAdmin();
  const id = str(fd, "id");
  const refuse = (error: string): SaveUserState => ({ error });
  if (id && !UUID.test(id)) redirect(PATH);
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const phoneRaw = str(fd, "phone");
  const role = str(fd, "role") as UserRole;
  const active = fd.get("active") === "on";
  if (!name) return refuse("name");
  if (!isValidEmail(email)) return refuse("email");
  if (phoneRaw && !isValidIsraeliPhone(phoneRaw)) return refuse("phone");
  if (!ROLES.includes(role)) return refuse("input");
  const me = await currentUser();
  // An admin cannot lock themselves out.
  if (id && me?.id === id && (role !== "admin" || !active)) return refuse("self");
  const allProjects = await listProjects();
  const tickedProjects = new Set(fd.getAll("projects").map(String));
  // A ticked project brings its organization along (ticking "ארצנו" alone means "שיבת ציון › ארצנו").
  const orgIds = [...new Set([
    ...fd.getAll("orgs").map(String).filter((o) => UUID.test(o)),
    ...allProjects.filter((p) => tickedProjects.has(p.id)).map((p) => p.organizationId),
  ])];
  // "Only some" with nothing ticked would silently mean "all": refuse it instead.
  if (role === "manager" && fd.get("orgScope") === "some" && orgIds.length === 0) return refuse("orgs");

  const saved = await saveUserDetails({ id: id || undefined, name, email, role, active, phone: phoneRaw ? normalizeIsraeliPhone(phoneRaw) : null });
  if (!saved.ok) return refuse("exists");
  const userId = (saved as { id: string }).id;

  if (role === "manager") {
    const limited = fd.get("orgScope") === "some";
    const chosen = allProjects.filter((p) => tickedProjects.has(p.id) && orgIds.includes(p.organizationId));
    const projectOrgs = new Set(chosen.map((p) => p.organizationId));
    await setUserOrgAccess(userId, limited ? orgIds.filter((o) => !projectOrgs.has(o)) : []);
    await setUserProjectAccess(userId, limited ? chosen.map((p) => p.id) : []);
    const grants = Object.fromEntries(GRANT_KEYS.map((k) => [k, fd.get(`grant.${k}`) === "on"])) as unknown as UserGrants;
    await setUserGrants(userId, grants);
    const packageIds = fd.getAll("packages").map(String).filter((p) => UUID.test(p));
    // "Sees every request" is a general grant now; the per-package flag is kept as it is, not re-posted by the form.
    const existing = await permissionsOf(userId);
    const rows: PackagePermission[] = packageIds.map((p) => ({
      packageTemplateId: p,
      canOpen: !!fd.get(`${p}.open`),
      canViewAll: existing.find((e) => e.packageTemplateId === p)?.canViewAll ?? false,
      canEditChain: false,
      canEdit: !!fd.get(`${p}.edit`),
    }));
    await setUserPermissions(userId, rows, packageIds);
  }
  revalidatePath(PATH, "layout");
  redirect(`${PATH}/${userId}?saved=1`);
}

const groupsBack = (q = "") => redirect(`${PATH}?tab=groups${q}`);

export async function createUserGroupAction(fd: FormData) {
  await requireAdmin();
  const name = str(fd, "name");
  if (!name) groupsBack("&error=group");
  const g = await createGroup(name);
  await setGroupUsers(g.id, fd.getAll("members").map(String).filter((m) => UUID.test(m)), []);
  revalidatePath(PATH, "layout");
  groupsBack(`&saved=group-${g.id}`);
}

export async function updateUserGroupAction(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  if (!UUID.test(id)) groupsBack();
  if (str(fd, "intent") === "delete") {
    await deleteGroup(id);
  } else {
    const name = str(fd, "name");
    if (!name) groupsBack("&error=group");
    await renameGroup(id, name);
    await setGroupUsers(id, fd.getAll("members").map(String).filter((m) => UUID.test(m)), fd.getAll("keep").map(String).filter((m) => UUID.test(m)));
  }
  revalidatePath(PATH, "layout");
  groupsBack(str(fd, "intent") === "delete" ? "&saved=deleted" : `&saved=group-${id}`);
}
