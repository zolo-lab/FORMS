import { redirect } from "next/navigation";

/** The identifying-fields screens became "רשימות". Old links land there. */
export default function FieldsPage() {
  redirect("/admin/lists");
}
