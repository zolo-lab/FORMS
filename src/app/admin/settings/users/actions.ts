"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin, type PackagePermission, type UserRole } from "@/lib/auth/permissions";
import { currentUser, setUserPermissions, updateUser } from "@/server/users-store";

const PATH = "/admin/settings/users";
const UUID = /^[0-9a-f-]{36}$/i;
const ROLES: UserRole[] = ["admin", "org_office", "approver", "payroll"];

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

/** One form per user: checkboxes named `<packageId>.open|view|chain`, plus `packages` = every package id shown. */
export async function savePermissionsAction(fd: FormData) {
  await requireAdmin();
  const userId = String(fd.get("userId") ?? "");
  const packageIds = fd.getAll("packages").map(String).filter((p) => UUID.test(p));
  if (!UUID.test(userId)) redirect(`${PATH}?error=input`);
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
