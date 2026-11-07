import { redirect } from "next/navigation";
import { hasGrant } from "@/lib/auth/permissions";
import { currentUser } from "@/server/users-store";

/** Identifying fields and the lists built on them: admins, and users with the "manage fields and lists" grant. */
export default async function FieldsLayout({ children }: { children: React.ReactNode }) {
  if (!hasGrant(await currentUser(), "manageFields")) redirect("/admin/requests");
  return children;
}
