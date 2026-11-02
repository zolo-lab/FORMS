/** Server-side permission checks for server actions (a page layout alone does not protect the actions it renders). */
import { redirect } from "next/navigation";
import { hasGrant, isAdmin, type UserGrants } from "@/lib/auth/permissions";
import { canSeeRequest, currentUser, viewerFormAccess } from "./users-store";
import { packageIdsWithForms, templatesOfPackages } from "./packages-store";

export async function requireAdmin() {
  if (!isAdmin(await currentUser())) redirect("/admin/requests");
}

export async function requireGrant(grant: keyof UserGrants) {
  if (!hasGrant(await currentUser(), grant)) redirect("/admin/requests");
}

export async function mayGrant(grant: keyof UserGrants): Promise<boolean> {
  return hasGrant(await currentUser(), grant);
}

/** The viewer may see (and so act on) this request. */
export async function requireRequest(requestId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(requestId) || !(await canSeeRequest(requestId))) redirect("/admin/requests");
}

/** May the viewer edit this form template: form builders always, otherwise only forms ticked "עריכה" for them. */
export async function mayEditTemplate(templateId: string): Promise<boolean> {
  const access = await viewerFormAccess();
  if (!access.allowed) return false;
  if (access.builder) return true;
  const packageIds = access.editable ?? [...(await packageIdsWithForms())];
  const links = await templatesOfPackages(packageIds);
  return links.some((l) => l.templateId === templateId);
}

/** The server-action twin of `mayEditTemplate`. */
export async function requireTemplateEdit(templateId: string) {
  if (!(await mayEditTemplate(templateId))) redirect("/admin/forms");
}
