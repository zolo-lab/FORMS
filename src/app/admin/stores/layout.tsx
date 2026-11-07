import { redirect } from "next/navigation";
import { hasGrant } from "@/lib/auth/permissions";
import { currentUser } from "@/server/users-store";

/** Data stores are part of building forms: admins, and managers with the "build forms" grant. */
export default async function StoresLayout({ children }: { children: React.ReactNode }) {
  if (!hasGrant(await currentUser(), "manageForms")) redirect("/admin/requests");
  return children;
}
