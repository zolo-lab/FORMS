import { redirect } from "next/navigation";

/** People and groups for steps moved to "משתמשים" (users, and groups of managers). */
export default function OldPeoplePage() {
  redirect("/admin/users?tab=groups");
}
