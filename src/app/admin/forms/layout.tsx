import { redirect } from "next/navigation";
import { viewerFormAccess } from "@/server/users-store";

/**
 * The forms tab: admins and form builders see everything; any other user who was given at least one form to send
 * or to edit sees exactly those forms (read-only unless the form is ticked for editing).
 */
export default async function FormsLayout({ children }: { children: React.ReactNode }) {
  if (!(await viewerFormAccess()).allowed) redirect("/admin/requests");
  return children;
}
