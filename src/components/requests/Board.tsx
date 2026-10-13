import Link from "next/link";
import { Card } from "@/components/ui/card";
import { boardColumns } from "@/lib/requests/list";
import type { RequestRow } from "@/server/dashboard-store";

/** Kanban view: a column per waiting role, a card per request. */
export function Board({ rows }: { rows: RequestRow[] }) {
  const cols = boardColumns(rows);
  if (cols.length === 0) return <Card className="p-6 text-center text-muted-foreground">אין בקשות להצגה.</Card>;
  return (
    <div className="flex gap-3 overflow-x-auto pb-2" role="list" aria-label="לוח בקשות">
      {cols.map((c) => (
        <section key={c.key} role="listitem" aria-label={c.title} className="w-64 shrink-0 space-y-2 rounded-lg bg-muted p-2">
          <h3 className="flex items-center justify-between px-1 text-sm font-semibold">
            {c.title}
            <span className="rounded-full bg-card px-2 py-0.5 text-xs text-muted-foreground">{c.rows.length}</span>
          </h3>
          <ul className="space-y-2">
            {c.rows.map((r) => (
              <li key={`${c.key}-${r.id}`}>
                <Link href={`/admin/requests/${r.id}`} className="block rounded-md border bg-card p-2 text-sm hover:border-primary">
                  <span className="font-medium">{r.subjectName}</span>
                  <span className="block text-xs text-muted-foreground">{r.organizationName} · {r.packageName}</span>
                  <span className="mt-1 flex items-center justify-between text-xs">
                    <span>{r.progress.total ? `${r.progress.done}/${r.progress.total}` : ""}</span>
                    {r.daysInStep !== null && <span className={r.overdue ? "font-medium text-destructive" : "text-muted-foreground"}>{r.daysInStep} ימים בשלב</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
