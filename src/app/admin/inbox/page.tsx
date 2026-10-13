import Link from "next/link";
import { Board } from "@/components/requests/Board";
import { Card } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/workflow/labels";
import type { StepRole } from "@/lib/workflow/types";
import { queryRequests, requestKpis } from "@/server/dashboard-store";

export const dynamic = "force-dynamic";

/** "Waiting for me": until users sign in with Google, the viewer picks the role they act as. */
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role: raw } = await searchParams;
  const role = raw && raw in ROLE_LABELS ? (raw as StepRole) : undefined;
  const [kpis, result] = await Promise.all([requestKpis(), role ? queryRequests({ role, page: 1 }, new Date(), 200) : Promise.resolve(null)]);
  const counts = new Map(kpis.waitingByRole.map((w) => [w.role, w.count]));
  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <h1 className="text-2xl font-bold">ממתינים לטיפול</h1>
      <p className="text-sm text-muted-foreground">בחרו תפקיד כדי לראות את הבקשות שממתינות לו. (חיבור משתמשים אישיים יתווסף עם כניסה באמצעות Google.)</p>
      <nav aria-label="תפקיד" className="flex flex-wrap gap-2">
        {(Object.keys(ROLE_LABELS) as StepRole[]).map((r) => (
          <Link
            key={r}
            href={`/admin/inbox?role=${r}`}
            aria-current={role === r ? "page" : undefined}
            className={`rounded-md border px-3 py-1.5 text-sm ${role === r ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
          >
            {ROLE_LABELS[r]} <strong>{counts.get(r) ?? 0}</strong>
          </Link>
        ))}
      </nav>
      {!result ? (
        <Card className="p-6 text-center text-muted-foreground">בחרו תפקיד למעלה.</Card>
      ) : result.rows.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">אין בקשות שממתינות ל{ROLE_LABELS[role!]}.</Card>
      ) : (
        <Board rows={result.rows} />
      )}
    </main>
  );
}
