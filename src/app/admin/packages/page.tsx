import Link from "next/link";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS } from "@/lib/workflow/labels";
import { validateWorkflow } from "@/lib/workflow/validate-workflow";
import { listOrgs } from "@/server/orgs-store";
import { listPackageSummaries } from "@/server/packages-store";
import { createPackageAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PackagesPage({ searchParams }: { searchParams: Promise<{ error?: string; archived?: string }> }) {
  const { error, archived } = await searchParams;
  const [packages, orgs] = await Promise.all([listPackageSummaries(archived === "1"), listOrgs()]);
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">מסלולי חתימה</h1>
        <form action={createPackageAction} className="flex gap-2">
          <Input name="name" placeholder="שם הערכה החדשה" className="w-56" aria-label="שם הערכה החדשה" />
          <Button type="submit">ערכה חדשה</Button>
        </form>
      </div>
      <p className="text-sm text-muted-foreground">ערכה היא קבוצת טפסים ומסלול חתימות (מי ממלא, מי חותם, מי מאשר). בקשה חדשה נוצרת מערכה.</p>
      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">יש להזין שם לערכה</p>}
      <Card className="divide-y">
        {packages.length === 0 && <p className="p-6 text-center text-muted-foreground">עדיין אין ערכות. צרו את הראשונה למעלה.</p>}
        {packages.map((p) => {
          const problems = validateWorkflow(p.workflow);
          return (
            <Link key={p.id} href={`/admin/packages/${p.id}`} className="flex flex-wrap items-center gap-3 p-4 hover:bg-accent">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{p.name}</p>
                <p className="text-sm text-muted-foreground">
                  {p.documentCount} טפסים · {p.workflow.steps.map((s) => ROLE_LABELS[s.role]).join(" ← ")} · {p.organizationId ? orgName.get(p.organizationId) : "כל הארגונים"}
                </p>
              </div>
              {p.documentCount === 0 && <Badge tone="warning">ללא טפסים</Badge>}
              {problems.length > 0 && <Badge tone="warning">מסלול לא תקין</Badge>}
              {p.archivedAt && <Badge tone="muted">בארכיון</Badge>}
            </Link>
          );
        })}
      </Card>
      <p className="text-sm">
        <Link className="text-primary underline" href={archived === "1" ? "/admin/packages" : "/admin/packages?archived=1"}>
          {archived === "1" ? "הסתר ארכיון" : "הצג גם ערכות בארכיון"}
        </Link>
      </p>
    </main>
  );
}
