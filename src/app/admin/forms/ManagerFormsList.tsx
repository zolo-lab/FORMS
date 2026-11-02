import Link from "next/link";
import { Badge, Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { listTemplates } from "@/server/forms-store";
import { packageIdsWithForms, templatesOfPackages } from "@/server/packages-store";

interface Access {
  openable: string[] | null;
  editable: string[] | null;
}

/**
 * The forms tab of a manager who is not a form builder: exactly the forms they were given, with "שליחה" on the ones
 * they may send and "עריכה" on the ones they may edit. Same tab, same place as the admin's – only narrower.
 */
export async function ManagerFormsList({ access }: { access: Access }) {
  const all = [...(await packageIdsWithForms())];
  const openable = access.openable ?? all;
  const editable = access.editable ?? all;
  const links = await templatesOfPackages([...new Set([...openable, ...editable])]);
  const templates = await listTemplates();

  const rows = templates
    .filter((t) => links.some((l) => l.templateId === t.id))
    .map((t) => {
      const mine = links.filter((l) => l.templateId === t.id);
      return {
        ...t,
        sendPackageId: mine.find((l) => openable.includes(l.packageTemplateId))?.packageTemplateId ?? null,
        mayEdit: mine.some((l) => editable.includes(l.packageTemplateId)),
      };
    });

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <PageHeader title="תבניות טפסים" description="הטפסים שהוקצו לך: מכאן שולחים בקשה חדשה, ובטפסים שהורשית לערוך אפשר גם לפתוח את הבונה." />
      <Card className="divide-y">
        {rows.length === 0 && <p className="p-6 text-center text-muted-foreground">עדיין לא הוקצו לך טפסים. פנו למנהל המערכת.</p>}
        {rows.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-48 flex-1 font-medium">{t.title}</div>
            {(!t.publishedVersion || t.status === "archived") && (
              <Badge tone="muted">{t.status === "archived" ? "בארכיון" : "טיוטה – עוד לא פורסם"}</Badge>
            )}
            <div className="flex gap-1">
              {t.mayEdit && (
                <Link href={`/admin/forms/${t.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>עריכה</Link>
              )}
              {t.sendPackageId && t.publishedVersion && t.status !== "archived" && (
                <Link href={`/admin/requests/new?package=${t.sendPackageId}`} className={buttonVariants({ size: "sm" })}>שליחה</Link>
              )}
            </div>
          </div>
        ))}
      </Card>
    </main>
  );
}
