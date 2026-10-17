import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth/permissions";
import { currentUser } from "@/server/users-store";

/** Building forms and packages is for admins only; ordinary users work from the requests list. */
export default async function AdminOnlyLayout({ children }: { children: React.ReactNode }) {
  if (!isAdmin(await currentUser())) redirect("/admin/requests");
  return children;
}
