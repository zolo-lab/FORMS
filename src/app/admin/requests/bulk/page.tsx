import Link from "next/link";
import { listPackagesForWizard } from "@/server/packages-store";
import { listOrganizations } from "@/server/requests-store";
import { BulkImport } from "./BulkImport";

export const dynamic = "force-dynamic";

export default async function BulkPage() {
  const [packages, orgs] = await Promise.all([listPackagesForWizard(), listOrganizations()]);
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <Link href="/admin/requests" className="text-sm text-muted-foreground hover:underline">
        ← חזרה לבקשות
      </Link>
      <h1 className="text-2xl font-bold">שליחה מרוכזת מקובץ</h1>
      <p className="text-sm text-muted-foreground">מעלים קובץ XLSX או CSV עם שורה לכל עובד, ממפים עמודות, בודקים ויוצרים בקשות לכולם בבת אחת.</p>
      <BulkImport packages={packages.map((p) => ({ id: p.id, name: p.name }))} orgs={orgs.map((o) => ({ id: o.id, name: o.name }))} />
    </main>
  );
}
