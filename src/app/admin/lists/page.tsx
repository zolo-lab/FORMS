import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { hasGrant } from "@/lib/auth/permissions";
import { listOrgFieldDefs, listOrgs, orgFieldKeysInForms } from "@/server/orgs-store";
import { currentUser } from "@/server/users-store";
import { OrgSheet } from "./OrgSheet";

export const dynamic = "force-dynamic";

/**
 * "רשימות": the fixed values the forms fill in by themselves, as sheets. One list for now – the organizations –
 * with a row per organization and a column per detail an admin added (deductions file, contract number…).
 * Suppliers and other lists join as more tabs later; the shape stays the same.
 */
export default async function ListsPage() {
  if (!hasGrant(await currentUser(), "manageFields")) redirect("/admin/requests");
  const [orgs, defs] = await Promise.all([listOrgs(), listOrgFieldDefs()]);
  const inForms = await orgFieldKeysInForms(defs.map((d) => d.key));
  return (
    <main className="space-y-6 px-4 py-6 lg:px-8">
      <PageHeader title="רשימות" description="הפרטים הקבועים שהטפסים ממלאים לבד – לפי העמותה שממנה יצאה הבקשה." />
      <div role="tablist" className="flex gap-1 border-b">
        <span role="tab" aria-selected="true" className="-mb-px border-b-2 border-primary px-4 py-2 text-sm font-medium text-primary">עמותות ועסקים</span>
      </div>
      <OrgSheet
        columns={defs.map((d) => ({ id: d.id, key: d.key, label: d.label, type: d.type, inForms: inForms.has(d.key) }))}
        rows={orgs.map((o) => ({ id: o.id, name: o.name, registrationNumber: o.registrationNumber, values: o.fieldValues ?? {} }))}
      />
    </main>
  );
}
