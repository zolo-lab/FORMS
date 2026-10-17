import Link from "next/link";
import { listPackagesForWizard } from "@/server/packages-store";
import { listOrganizations } from "@/server/requests-store";
import { viewer, viewerOpenablePackages } from "@/server/users-store";
import { listProjects } from "@/server/orgs-store";
import { projectLimit, usableOrgIds } from "@/lib/auth/permissions";
import { BulkImport } from "./BulkImport";

export const dynamic = "force-dynamic";

export default async function BulkPage() {
  const [all, allOrgs, allowed, v, allProjects] = await Promise.all([listPackagesForWizard(), listOrganizations({ activeOnly: true }), viewerOpenablePackages(), viewer(), listProjects()]);
  const packages = allowed ? all.filter((p) => allowed.includes(p.id)) : all;
  const usable = usableOrgIds(v.access);
  const orgs = usable ? allOrgs.filter((o) => usable.includes(o.id)) : allOrgs;
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <Link href="/admin/requests" className="text-sm text-muted-foreground hover:underline">
        ← חזרה לבקשות
      </Link>
      <h1 className="text-2xl font-bold">שליחה מרוכזת מקובץ</h1>
      <p className="text-sm text-muted-foreground">מעלים קובץ XLSX או CSV עם שורה לכל עובד, ממפים עמודות, בודקים ויוצרים בקשות לכולם בבת אחת.</p>
      <BulkImport packages={packages.map((p) => ({ id: p.id, name: p.name }))} orgs={orgs.map((o) => {
          const limit = projectLimit(v.access, o.id);
          return { id: o.id, name: o.name, projects: allProjects.filter((p) => p.organizationId === o.id && p.active && (!limit || limit.includes(p.id))).map((p) => ({ id: p.id, name: p.name })), projectRequired: !!limit };
        })} />
    </main>
  );
}
