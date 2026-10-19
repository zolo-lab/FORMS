import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RemindButton } from "@/components/requests/RemindButton";
import { canTrack, usableOrgIds } from "@/lib/auth/permissions";
import { parseFilters } from "@/lib/requests/list";
import { REQUEST_STATUS_LABEL, ROLE_LABELS } from "@/lib/workflow/labels";
import type { StepRole } from "@/lib/workflow/types";
import { listPackages, queryRequests } from "@/server/dashboard-store";
import { listOrganizations } from "@/server/requests-store";
import { currentUser, viewerScope } from "@/server/users-store";

export const dynamic = "force-dynamic";

const STUCK_DAYS = 7;
type SP = Promise<Record<string, string | string[] | undefined>>;

/**
 * Tracking screen (secretariats): who is waiting, at which step and for how long, and a reminder button.
 * Status only – never answers, files, PDFs or signing links. Open requests by default.
 */
export default async function TrackPage({ searchParams }: { searchParams: SP }) {
  const me = await currentUser();
  if (!canTrack(me)) redirect("/admin/requests");
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const showAll = sp.all === "1";
  if (!filters.status && !showAll) filters.status = "in_progress";
  const scope = await viewerScope();
  const [orgs, packages, result] = await Promise.all([listOrganizations(), listPackages(), queryRequests(filters, new Date(), 100, scope)]);
  const allowed = usableOrgIds(scope?.access ?? null);
  const fmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeZone: "Asia/Jerusalem" });
  const rows = [...result.rows].sort((a, b) => (b.daysInStep ?? -1) - (a.daysInStep ?? -1));
  const stuck = rows.filter((r) => (r.daysInStep ?? 0) > STUCK_DAYS).length;
  const waiting = (r: (typeof rows)[number]) => r.waitingFor.map((w) => `${ROLE_LABELS[w.role as StepRole] ?? w.role}${w.name ? ` – ${w.name}` : ""}`).join(", ") || "—";

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">מעקב חתימות{filters.campaign ? ` – ${filters.campaign}` : ""}</h1>
        <p className="text-sm text-muted-foreground">מי ממתין, באיזה שלב וכמה זמן. אפשר לשלוח תזכורת – הקישור נשלח ישירות לממתין. תוכן הטפסים לא מוצג כאן.</p>
      </header>

      <section aria-label="סיכום" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">בקשות ברשימה</p>
          <p className="text-2xl font-bold">{result.total}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">תקועות יותר מ-{STUCK_DAYS} ימים</p>
          <p className={`text-2xl font-bold ${stuck ? "text-destructive" : ""}`}>{stuck}</p>
        </Card>
      </section>

      <form method="get" className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="סינון">
        <div className="space-y-1 lg:col-span-2">
          <Label htmlFor="q">חיפוש לפי שם</Label>
          <Input id="q" name="q" defaultValue={filters.q ?? ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="org">עמותה</Label>
          <Select id="org" name="org" defaultValue={filters.org ?? ""}>
            <option value="">הכול</option>
            {(allowed ? orgs.filter((o) => allowed.includes(o.id)) : orgs).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pkg">סוג טופס</Label>
          <Select id="pkg" name="pkg" defaultValue={filters.pkg ?? ""}>
            <option value="">הכול</option>
            {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="status">מצב</Label>
          <Select id="status" name="status" defaultValue={showAll && !sp.status ? "" : (filters.status ?? "")}>
            <option value="">הכול</option>
            {Object.entries(REQUEST_STATUS_LABEL).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
          </Select>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5 lg:justify-end">
          {showAll && <input type="hidden" name="all" value="1" />}
          {filters.campaign && <input type="hidden" name="campaign" value={filters.campaign} />}
          <Link href="/admin/track" className={buttonVariants({ variant: "ghost" })}>ניקוי</Link>
          <button type="submit" className={buttonVariants()}>סינון</button>
        </div>
      </form>

      {rows.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">אין בקשות שממתינות לחתימה. {!showAll && <Link className="text-primary underline" href="/admin/track?all=1">הצגת כל הבקשות</Link>}</Card>
      ) : (
        <>
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <caption className="sr-only">בקשות לפי זמן המתנה, מהארוך לקצר</caption>
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  {["עובד", "סוג טופס", "עמותה", "ממתין ל", "ימים בשלב", "נשלח", "בתוקף עד", "מצב", ""].map((h, i) => (
                    <th key={i} scope="col" className="px-3 py-2 text-start font-medium">{h || <span className="sr-only">פעולות</span>}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => {
                  const [label, tone] = REQUEST_STATUS_LABEL[r.status];
                  const late = (r.daysInStep ?? 0) > STUCK_DAYS;
                  const open = r.status === "in_progress" || r.status === "returned";
                  return (
                    <tr key={r.id}>
                      <td className="px-3 py-2 font-medium">{r.subjectName}</td>
                      <td className="px-3 py-2">{r.packageName}</td>
                      <td className="px-3 py-2">{r.organizationName}</td>
                      <td className="px-3 py-2">{waiting(r)}</td>
                      <td className={`px-3 py-2 ${late ? "font-semibold text-destructive" : ""}`}>
                        {r.daysInStep ?? "—"}
                        {late && <span className="ms-1 text-xs">(תקוע)</span>}
                      </td>
                      <td className="px-3 py-2">{fmt.format(r.createdAt)}</td>
                      <td className={`px-3 py-2 ${r.overdue ? "font-medium text-destructive" : ""}`}>{r.expiresAt ? fmt.format(r.expiresAt) : "ללא"}{r.overdue && <span className="ms-1 text-xs">(פג)</span>}</td>
                      <td className="px-3 py-2"><Badge tone={tone}>{label}</Badge></td>
                      <td className="px-3 py-2">{open && <RemindButton requestId={r.id} subject={r.subjectName} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <ul className="space-y-3 md:hidden" aria-label="בקשות">
            {rows.map((r) => {
              const [label, tone] = REQUEST_STATUS_LABEL[r.status];
              const late = (r.daysInStep ?? 0) > STUCK_DAYS;
              const open = r.status === "in_progress" || r.status === "returned";
              return (
                <li key={r.id}>
                  <Card className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{r.subjectName}</p>
                        <p className="text-xs text-muted-foreground">{r.packageName} · {r.organizationName}</p>
                      </div>
                      <Badge tone={tone}>{label}</Badge>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                      <dt className="text-muted-foreground">ממתין ל</dt>
                      <dd>{waiting(r)}</dd>
                      <dt className="text-muted-foreground">ימים בשלב</dt>
                      <dd className={late ? "font-semibold text-destructive" : ""}>{r.daysInStep ?? "—"}{late && " (תקוע)"}</dd>
                      <dt className="text-muted-foreground">בתוקף עד</dt>
                      <dd>{r.expiresAt ? fmt.format(r.expiresAt) : "ללא"}</dd>
                    </dl>
                    {open && <RemindButton requestId={r.id} subject={r.subjectName} />}
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
