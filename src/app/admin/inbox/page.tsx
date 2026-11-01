import Link from "next/link";
import { Board } from "@/components/requests/Board";
import { Card } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/workflow/labels";
import type { StepRole } from "@/lib/workflow/types";
import { queryRequests, requestKpis } from "@/server/dashboard-store";
import { currentUser } from "@/server/users-store";

export const dynamic = "force-dynamic";

/** "Waiting for me": steps addressed to the signed-in user; without a signed-in user (open mode / password) the viewer picks a role. */
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role: raw } = await searchParams;
  const me = await currentUser();
  if (me) {
    const result = await queryRequests({ assigneeEmail: me.email, page: 1 }, new Date(), 200);
    return (
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        <h1 className="text-2xl font-bold">ממתינים לי</h1>
        <p className="text-sm text-muted-foreground">בקשות שבהן שלב פתוח ממוען אליך ({me.email}).</p>
        {result.rows.length === 0 ? <Card className="p-6 text-center text-muted-foreground">אין בקשות שממתינות לך.</Card> : <Board rows={result.rows} />}
      </main>
    );
  }
  const role = raw && raw in ROLE_LABELS ? (raw as StepRole) : undefined;
  const [kpis, result] = await Promise.all([requestKpis(), role ? queryRequests({ role, page: 1 }, new Date(), 200) : Promise.resolve(null)]);
  const counts = new Map(kpis.waitingByRole.map((w) => [w.role, w.count]));
  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <h1 className="text-2xl font-bold">ממתינים לטיפול</h1>
      <p className="text-sm text-muted-foreground">בחרו תפקיד כדי לראות את הבקשות שממתינות לו. (חיבור משתמשים אישיים יתווסף עם כניסה באמצעות Google.)</p>
      <nav aria-label="תפקיד" className="flex flex-wrap gap-2">
        {/* Further approval steps ("מאשר 2"…) only when something waits for them. */}
        {(Object.keys(ROLE_LABELS) as StepRole[]).filter((r) => r !== "unassigned" && (!/^approver\d$/.test(r) || counts.get(r) || role === r)).map((r) => (
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
