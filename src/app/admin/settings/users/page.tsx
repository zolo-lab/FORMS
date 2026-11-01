import { redirect } from "next/navigation";

/** Users moved to the main menu ("משתמשים"). */
export default function OldUsersPage() {
  redirect("/admin/users");
}
