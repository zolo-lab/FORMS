import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { Timeline } from "@/lib/requests/timeline";
import { STATE } from "@/components/requests/RequestTimeline";
import { cn } from "@/lib/utils";

export interface ChainRow {
  id: string;
  subjectName: string;
  packageName: string | null;
  organizationName: string | null;
  createdAt: Date;
  timeline: Timeline;
}

const fmtDate = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeZone: "Asia/Jerusalem" });

/** "In my chain" as a table: one row per request, where it is now, where the viewer stands, and a dot per step. */
export function ChainTable({ rows }: { rows: ChainRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 text-start font-medium">שם</th>
            <th scope="col" className="hidden px-3 py-2 text-start font-medium md:table-cell">עמותה</th>
            <th scope="col" className="px-3 py-2 text-start font-medium">איפה עכשיו</th>
            <th scope="col" className="px-3 py-2 text-start font-medium">המצב שלי</th>
            <th scope="col" className="px-3 py-2 text-start font-medium">שלבים</th>
            <th scope="col" className="hidden px-3 py-2 text-start font-medium sm:table-cell">נשלחה</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const { steps, summary, viewerNote, stuck } = r.timeline;
            const pos = steps.findIndex((s) => s.state === "current");
            return (
              <tr key={r.id} className="border-t align-top hover:bg-muted/30">
                <td className="px-3 py-2.5">
                  <Link href={`/admin/requests/${r.id}`} className="font-medium text-primary hover:underline">{r.subjectName}</Link>
                  {r.packageName && <p className="text-xs text-muted-foreground">{r.packageName}</p>}
                </td>
                <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">{r.organizationName ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <span className={cn(stuck && "text-destructive")}>
                    {stuck && <AlertTriangle className="me-1 inline size-3.5 align-[-2px]" aria-label="תקוע" />}
                    {summary}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {viewerNote ? <span className="whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{viewerNote}</span> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <ol className="flex items-center gap-1" aria-label="שלבי הבקשה">
                      {steps.map((s) => (
                        <li
                          key={s.id}
                          title={`${s.who} – ${STATE[s.state].label}`}
                          className={cn("size-2.5 rounded-full border", STATE[s.state].dot, s.isViewer && "ring-2 ring-primary/40 ring-offset-1 ring-offset-card")}
                        >
                          <span className="sr-only">{`${s.who} – ${STATE[s.state].label}${s.isViewer ? " (את/ה)" : ""}`}</span>
                        </li>
                      ))}
                    </ol>
                    {pos >= 0 && <span className="whitespace-nowrap text-xs text-muted-foreground">{pos + 1}/{steps.length}</span>}
                  </div>
                </td>
                <td className="hidden whitespace-nowrap px-3 py-2.5 text-muted-foreground sm:table-cell">{fmtDate.format(r.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
