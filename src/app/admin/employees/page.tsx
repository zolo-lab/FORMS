import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { canViewContent, usableOrgIds } from "@/lib/auth/permissions";
import { listEmployees } from "@/server/employees-store";
import { currentUser, viewerScope } from "@/server/users-store";

export const dynamic = "force-dynamic";

/** Employees: one record per ID number, with the organizations they work in and how many requests they have. */
export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await currentUser();
  if (!canViewContent(me)) redirect("/admin/track");
  const { q } = await searchParams;
  const scope = await viewerScope();
  const rows = await listEmployees(q, usableOrgIds(scope?.access ?? null));
  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">עובדים</h1>
        <p className="text-sm text-muted-foreground">כל אדם מופיע פעם אחת לפי תעודת זהות, עם כל הבקשות והמסמכים שלו. רשומה נוצרת אוטומטית כשנפתחת בקשה.</p>
      </header>
      <form method="get" className="flex flex-wrap items-end gap-2" role="search">
        <div className="min-w-60 flex-1 space-y-1">
          <Label htmlFor="q">חיפוש לפי שם או ת&quot;ז</Label>
          <Input id="q" name="q" defaultValue={q ?? ""} />
        </div>
        <Button type="submit">חיפוש</Button>
      </form>
      {rows.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">{q ? "לא נמצאו עובדים." : "עדיין אין רשומות עובדים. הן נוצרות כשנפתחת בקשה עם תעודת זהות."}</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">רשימת עובדים</caption>
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th scope="col" className="px-3 py-2 text-start font-medium">שם</th>
                <th scope="col" className="px-3 py-2 text-start font-medium">ת&quot;ז</th>
                <th scope="col" className="px-3 py-2 text-start font-medium">עמותות</th>
                <th scope="col" className="px-3 py-2 text-start font-medium">בקשות</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2"><Link href={`/admin/employees/${r.id}`} className="font-medium text-primary hover:underline">{r.name}</Link></td>
                  <td className="px-3 py-2" dir="ltr">{r.idNumber}</td>
                  <td className="px-3 py-2">{r.organizations.join(", ") || "—"}</td>
                  <td className="px-3 py-2">{r.requests}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </main>
  );
}
