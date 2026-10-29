import { redirect } from "next/navigation";

/** Signing routes are part of each form now ("שלבי הטופס" in the form editor), like in iForms. */
export default function PackagesPage() {
  redirect("/admin/forms");
}
