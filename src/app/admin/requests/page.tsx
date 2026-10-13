import Link from "next/link";
import { Badge, Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { REQUEST_STATUS_LABEL } from "@/lib/workflow/labels";
import { listRequests } from "@/server/requests-store";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const rows = await listRequests();
  const fmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" });
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">בקשות</h1>
        <Link href="/admin/requests/new" className={buttonVariants()}>
          בקשה חדשה
        </Link>
      </div>
      <Card className="divide-y">
        {rows.length === 0 && <p className="p-6 text-center text-muted-foreground">עדיין אין בקשות.</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-48 flex-1">
              <Link href={`/admin/requests/${r.id}`} className="font-medium hover:underline">
                {r.subjectName}
              </Link>
              <p className="text-xs text-muted-foreground">
                {r.organizationName} · {r.packageName}
              </p>
            </div>
            <Badge tone={REQUEST_STATUS_LABEL[r.status][1]}>{REQUEST_STATUS_LABEL[r.status][0]}</Badge>
            <span className="text-sm text-muted-foreground">{fmt.format(r.createdAt)}</span>
          </div>
        ))}
      </Card>
    </main>
  );
}
