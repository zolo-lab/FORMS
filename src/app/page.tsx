import { redirect } from "next/navigation";

/** The app starts in the admin area (the inbox; login first when there is no session). */
export default function Home() {
  redirect("/admin/inbox");
}
