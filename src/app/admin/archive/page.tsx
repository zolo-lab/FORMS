import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildExportTable } from "@/lib/export/rows";
import { archiveView } from "@/lib/export/archive-view";
import { filtersToQuery, parseFilters } from "@/lib/requests/list";
import { listPackages } from "@/server/dashboard-store";
import { listExportTemplates } from "@/server/export-templates-store";
import { loadExport } from "@/server/export-store";
import { listOrganizations } from "@/server/requests-store";
import { hasGrant, isAdmin, isTrackOnly } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { currentUser, viewerScope } from "@/server/users-store";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;

/** Data archive: every value filled in for one kind of form, across all its completed requests. */
export default async function ArchivePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const parsed = parseFilters(sp);
  const filters = { ...parsed, status: "completed" as const };
  const [orgs, packages, templates, scope, me] = await Promise.all([listOrganizations(), listPackages(), listExportTemplates(), viewerScope(), currentUser()]);
  // The archive shows answers: never to tracking-only users.
  if (isTrackOnly(me)) redirect("/admin/track");
  const canExport = hasGrant(me, "export");
  const pkg = packages.find((p) => p.id === filters.pkg);
  // Only the requests the viewer may see (their own, packages they view fully, the "sees all" grant, their organizations).
  const view = pkg ? archiveView(buildExportTable(await loadExport({ filters, scope }))) : null;
  const qs = filtersToQuery(filters);
  const exportHref = (format: string, template?: string) => `/api/admin/requests/export?${qs}&format=${format}${template ? `&template=${template}` : ""}`;

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">נתונים וייצוא</h1>
        <p className="text-sm text-muted-foreground">כל הערכים שמולאו, לפי סוג טופס (מסלול חתימה). המסמכים החתומים עצמם נמצאים בארכיון ב-Drive, והקישור אליהם בדף כל בקשה.{isAdmin(me) && <> <Link href="/admin/settings/exports" className="underline">תבניות ייצוא</Link></>}</p>
      </div>

      <form method="get" className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="סינון">
        <div className="space-y-1">
          <Label htmlFor="pkg">סוג טופס (ערכה)</Label>
          <Select id="pkg" name="pkg" defaultValue={filters.pkg ?? ""}>
            <option value="">בחרו ערכה…</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="org">ארגון</Label>
          <Select id="org" name="org" defaultValue={filters.org ?? ""}>
            <option value="">הכול</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="q">חיפוש (שם, ת&quot;ז, מייל)</Label>
          <Input id="q" name="q" defaultValue={filters.q ?? ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="from">מתאריך</Label>
          <Input id="from" name="from" type="date" dir="ltr" defaultValue={filters.from ?? ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">עד תאריך</Label>
          <Input id="to" name="to" type="date" dir="ltr" defaultValue={filters.to ?? ""} />
        </div>
        <div className="flex items-end">
          <Button type="submit">הצגה</Button>
        </div>
      </form>

      {!pkg && (
        <Card className="divide-y">
          <p className="p-3 text-sm text-muted-foreground">בחרו ערכה כדי לראות את הנתונים שלה.</p>
          {packages.map((p) => (
            <Link key={p.id} href={`/admin/archive?pkg=${p.id}`} className="block p-3 text-sm hover:bg-accent">
              {p.name}
            </Link>
          ))}
        </Card>
      )}

      {pkg && view && (
        <section className="space-y-3" aria-label="נתונים">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground" role="status">
              {view.total === 0 ? "אין בקשות מתאימות" : view.truncated ? `מוצגות ${view.rows.length} מתוך ${view.total} בקשות (הייצוא כולל את כולן)` : `${view.total} בקשות`}
            </p>
            {canExport && <span className="ms-auto flex flex-wrap gap-2">
              <a className={buttonVariants({ variant: "outline" })} href={exportHref("xlsx")}>
                ייצוא Excel
              </a>
              <a className={buttonVariants({ variant: "outline" })} href={exportHref("csv")}>
                ייצוא CSV
              </a>
            </span>}
          </div>
          {canExport && templates.length > 0 && (
            <p className="text-xs text-muted-foreground">
              בתבנית ייצוא:{" "}
              {templates.map((t) => (
                <a key={t.id} className="me-3 text-primary hover:underline" href={exportHref("xlsx", t.id)}>
                  {t.name}
                </a>
              ))}
            </p>
          )}
          {view.rows.length > 0 && (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-start">
                  <tr>
                    {view.headers.map((h, i) => (
                      <th key={i} scope="col" className="whitespace-nowrap px-3 py-2 text-start font-medium">
                        {i === 0 ? "בקשה" : h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {view.rows.map((r, ri) => (
                    <tr key={ri} className="hover:bg-accent">
                      {r.map((c, ci) => (
                        <td key={ci} className="whitespace-nowrap px-3 py-1.5 text-start">
                          {ci === 0 ? (
                            <Link className="text-primary hover:underline" href={`/admin/requests/${c}`}>
                              פתיחת הבקשה
                            </Link>
                          ) : (
                            c
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>
      )}
    </main>
  );
}
