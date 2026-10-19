import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge, Card } from "@/components/ui/card";
import { canViewContent, usableOrgIds } from "@/lib/auth/permissions";
import { REQUEST_STATUS_LABEL } from "@/lib/workflow/labels";
import { getEmployee } from "@/server/employees-store";
import { canSeeRequest, currentUser, viewerScope } from "@/server/users-store";

export const dynamic = "force-dynamic";

/** Employee card: details, organizations, and every request (only those the viewer may open are links). */
export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser();
  if (!canViewContent(me)) redirect("/admin/track");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getEmployee(id);
  if (!data) notFound();
  const scope = await viewerScope();
  const allowed = usableOrgIds(scope?.access ?? null);
  if (allowed && !data.organizations.some((o) => allowed.includes(o.orgId))) notFound();
  const visible = await Promise.all(data.requests.map(async (r) => ((await canSeeRequest(r.id)) ? r : null)));
  const reqs = visible.filter((r): r is NonNullable<typeof r> => !!r);
  const fmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeZone: "Asia/Jerusalem" });
  const e = data.employee;
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <Link href="/admin/employees" className="text-sm text-muted-foreground hover:underline">→ כל העובדים</Link>
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{e.name}</h1>
        <p className="text-sm text-muted-foreground">
          ת&quot;ז <span dir="ltr">{e.idNumber}</span>
          {e.email && <> · <span dir="ltr">{e.email}</span></>}
          {e.phone && <> · <span dir="ltr">{e.phone}</span></>}
        </p>
        <p className="text-sm">{data.organizations.map((o) => (o.project ? `${o.org} – ${o.project}` : o.org)).join(", ")}</p>
      </header>
      <section className="space-y-2" aria-labelledby="reqs-h">
        <h2 id="reqs-h" className="font-semibold">בקשות ומסמכים ({reqs.length})</h2>
        {reqs.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">אין בקשות שאפשר להציג לך.</Card>
        ) : (
          <Card className="divide-y">
            {reqs.map((r) => {
              const [label, tone] = REQUEST_STATUS_LABEL[r.status];
              return (
                <Link key={r.id} href={`/admin/requests/${r.id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 p-3 text-sm hover:bg-accent">
                  <span>
                    <span className="font-medium">{r.packageName}</span>
                    <span className="ms-2 text-muted-foreground">{r.orgName} · {fmt.format(r.createdAt)}{r.completedAt ? ` · הושלמה ${fmt.format(r.completedAt)}` : ""}</span>
                  </span>
                  <Badge tone={tone}>{label}</Badge>
                </Link>
              );
            })}
          </Card>
        )}
      </section>
    </main>
  );
}
