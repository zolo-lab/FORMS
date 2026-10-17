/** Server-side permission checks for server actions (a page layout alone does not protect the actions it renders). */
import { redirect } from "next/navigation";
import { hasGrant, isAdmin, type UserGrants } from "@/lib/auth/permissions";
import { canSeeRequest, currentUser } from "./users-store";

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
