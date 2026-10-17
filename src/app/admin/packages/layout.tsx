import { redirect } from "next/navigation";
import { hasGrant } from "@/lib/auth/permissions";
import { currentUser } from "@/server/users-store";

/** Building forms and packages: admins, and managers with the "build forms and packages" grant. */
export default async function AdminOnlyLayout({ children }: { children: React.ReactNode }) {
  if (!hasGrant(await currentUser(), "manageForms")) redirect("/admin/requests");
  return children;
}
