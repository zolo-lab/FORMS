"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { GRANT_KEYS, type PackagePermission, type UserGrants, type UserRole } from "@/lib/auth/permissions";
import { isValidEmail, isValidIsraeliPhone, normalizeIsraeliPhone } from "@/lib/validators/israeli";
import { requireAdmin } from "@/server/guards";
import { listProjects } from "@/server/orgs-store";
import { createGroup, deleteGroup, renameGroup } from "@/server/people-store";
import { saveUserDetails, setGroupUsers } from "@/server/user-admin";
import { currentUser, setUserGrants, setUserOrgAccess, setUserPermissions, setUserProjectAccess } from "@/server/users-store";

const PATH = "/admin/users";
const UUID = /^[0-9a-f-]{36}$/i;
const ROLES: UserRole[] = ["admin", "manager"];
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/**
 * One form for everything about a user (new when `id` is empty): details, type, and for a manager the extra
 * permissions, the forms they may send/see, and the organizations. No password here: sign-in is set up separately.
 */
export async function saveUserAction(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  const edit = (q: string) => redirect(`${PATH}/${id || "new"}${q}`);
  if (id && !UUID.test(id)) redirect(PATH);
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const phoneRaw = str(fd, "phone");
  const role = str(fd, "role") as UserRole;
  const active = fd.get("active") === "on";
  if (!name) edit("?error=name");
  if (!isValidEmail(email)) edit("?error=email");
  if (phoneRaw && !isValidIsraeliPhone(phoneRaw)) edit("?error=phone");
  if (!ROLES.includes(role)) edit("?error=input");
  const me = await currentUser();
  // An admin cannot lock themselves out.
  if (id && me?.id === id && (role !== "admin" || !active)) edit("?error=self");
  const orgIds = fd.getAll("orgs").map(String).filter((o) => UUID.test(o));
  // "Only some" with nothing ticked would silently mean "all": refuse it instead.
  if (role === "manager" && fd.get("orgScope") === "some" && orgIds.length === 0) edit("?error=orgs");

  const saved = await saveUserDetails({ id: id || undefined, name, email, role, active, phone: phoneRaw ? normalizeIsraeliPhone(phoneRaw) : null });
  if (!saved.ok) edit("?error=exists");
  const userId = (saved as { id: string }).id;

  if (role === "manager") {
    const limited = fd.get("orgScope") === "some";
    const ticked = new Set(fd.getAll("projects").map(String));
    const chosen = (await listProjects()).filter((p) => ticked.has(p.id) && orgIds.includes(p.organizationId));
    const projectOrgs = new Set(chosen.map((p) => p.organizationId));
    await setUserOrgAccess(userId, limited ? orgIds.filter((o) => !projectOrgs.has(o)) : []);
    await setUserProjectAccess(userId, limited ? chosen.map((p) => p.id) : []);
    const grants = Object.fromEntries(GRANT_KEYS.map((k) => [k, fd.get(`grant.${k}`) === "on"])) as unknown as UserGrants;
    await setUserGrants(userId, grants);
    const packageIds = fd.getAll("packages").map(String).filter((p) => UUID.test(p));
    const rows: PackagePermission[] = packageIds.map((p) => ({
      packageTemplateId: p,
      canOpen: !!fd.get(`${p}.open`),
      canViewAll: !!fd.get(`${p}.view`),
      canEditChain: false,
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
  groupsBack("&saved=1");
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
  groupsBack("&saved=1");
}
