import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth/permissions";
import { currentUser } from "@/server/users-store";

/** Every settings page is for admins only. */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  if (!isAdmin(await currentUser())) redirect("/admin/requests");
  return children;
}
