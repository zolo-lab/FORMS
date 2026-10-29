import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PAGE_SIZE, ariaSort, filtersToQuery, nextSort, parseFilters, type SortKey } from "@/lib/requests/list";
import { REQUEST_STATUS_LABEL, ROLE_LABELS } from "@/lib/workflow/labels";
import type { StepRole } from "@/lib/workflow/types";
import { listPackages, queryRequests, requestKpis } from "@/server/dashboard-store";
import { currentUser, viewerScope } from "@/server/users-store";
import { hasGrant, isAdmin, isTrackOnly, usableOrgIds } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { Board } from "@/components/requests/Board";
import { SelectAll } from "@/components/requests/SelectAll";
import { listOrganizations } from "@/server/requests-store";
import { bulkCancelAction } from "./actions";
import { listExportTemplates } from "@/server/export-templates-store";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;

function Kpi({ label, value, hint, href }: { label: string; value: string | number; hint?: string; href?: string }) {
  const body = (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
  return href ? (
    <Link href={href} className="block hover:opacity-90">
      {body}
    </Link>
  ) : (
    body
  );
}

export default async function RequestsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const me0 = await currentUser();
  // Tracking-only users have their own screen, without content.
  if (isTrackOnly(me0)) redirect("/admin/track");
  // A manager who doesn't see every request starts with the requests they opened ("all" shows everything they may see).
  const narrowByDefault = !!me0 && !isAdmin(me0) && !hasGrant(me0, "viewAll");
  if (narrowByDefault && sp.all !== "1" && !filters.mine) filters.mine = true;
  if (filters.mine && me0) filters.createdBy = me0.id;
  const allLink = (() => {
    const qs = filtersToQuery({ ...filters, mine: false, page: 1 });
    return `/admin/requests?${qs ? `${qs}&` : ""}all=1`;
  })();
  const cancelled = typeof sp.cancelled === "string" ? Number(sp.cancelled) : null;
  const skipped = typeof sp.skipped === "string" ? Number(sp.skipped) : 0;
  const scope = await viewerScope();
  const me = await currentUser();
  const canExport = hasGrant(me, "export");
  const canCancel = hasGrant(me, "cancel");
  const [orgs, packages, kpis, result, exportTemplates] = await Promise.all([listOrganizations(), listPackages(), requestKpis(filters.org, new Date(), scope), queryRequests(filters, new Date(), filters.view === "board" ? 200 : undefined, scope), listExportTemplates()]);
  const fmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeZone: "Asia/Jerusalem" });
  const page = Math.min(filters.page, result.pageCount);
  const link = (over: Parameters<typeof filtersToQuery>[1]) => {
    const qs = filtersToQuery(filters, over);
    return `/admin/requests${qs ? `?${qs}` : ""}`;
  };
  const hasFilters = Object.keys(filters).some((k) => k !== "page" && k !== "sort" && k !== "dir");

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <PageHeader
        title="בקשות"
        description="כל הבקשות שאתה רשאי לראות: מי ממתין, כמה זמן ומה הושלם. לחיצה על כותרת עמודה ממיינת."
        actions={
          <>
          <nav aria-label="תצוגה" className="flex overflow-hidden rounded-md border text-sm">
            <Link href={link({ view: undefined, page: 1 })} aria-current={!filters.view ? "page" : undefined} className={`px-3 py-1.5 ${!filters.view ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>טבלה</Link>
            <Link href={link({ view: "board", page: 1 })} aria-current={filters.view === "board" ? "page" : undefined} className={`px-3 py-1.5 ${filters.view === "board" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>לוח</Link>
          </nav>
          <Link href="/admin/requests/bulk" className={buttonVariants({ variant: "ghost" })}>
            שליחה מקובץ
          </Link>
          <Link href="/admin/requests/new" className={buttonVariants()}>
            בקשה חדשה
          </Link>
          </>
        }
      />

      <section aria-label="מדדים" className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="פעילות" value={kpis.active} href={link({ status: "in_progress", page: 1 })} />
        <Kpi label="באיחור" value={kpis.overdue} href={link({ overdue: true, page: 1 })} />
        <Kpi label="הושלמו ב-30 ימים" value={kpis.completed30} href={link({ status: "completed", page: 1 })} />
        <Kpi label="חציון ימים להשלמה" value={kpis.medianDaysToComplete ?? "—"} />
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">ממתינות לתפקיד</p>
          {kpis.waitingByRole.length === 0 ? (
            <p className="text-2xl font-bold">0</p>
          ) : (
            <ul className="mt-1 space-y-0.5 text-sm">
              {kpis.waitingByRole.map((w) => (
                <li key={w.role}>
                  <Link href={link({ role: w.role, page: 1 })} className="hover:underline">
                    {ROLE_LABELS[w.role as StepRole] ?? w.role}: <strong>{w.count}</strong>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <form method="get" className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="סינון">
        {filters.view && <input type="hidden" name="view" value={filters.view} />}
        <div className="space-y-1 lg:col-span-2">
          <Label htmlFor="q">חיפוש (שם, ת&quot;ז, מייל)</Label>
          <Input id="q" name="q" defaultValue={filters.q ?? ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="org">ארגון</Label>
          <Select id="org" name="org" defaultValue={filters.org ?? ""}>
            <option value="">הכול</option>
            {(usableOrgIds(scope?.access ?? null) ? orgs.filter((o) => usableOrgIds(scope?.access ?? null)!.includes(o.id)) : orgs).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pkg">טופס</Label>
          <Select id="pkg" name="pkg" defaultValue={filters.pkg ?? ""}>
            <option value="">הכול</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="status">סטטוס</Label>
          <Select id="status" name="status" defaultValue={filters.status ?? ""}>
            <option value="">הכול</option>
            {Object.entries(REQUEST_STATUS_LABEL).map(([k, [label]]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="role">ממתין ל</Label>
          <Select id="role" name="role" defaultValue={filters.role ?? ""}>
            <option value="">הכול</option>
            {Object.entries(ROLE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="from">מתאריך</Label>
          <Input id="from" name="from" type="date" dir="ltr" defaultValue={filters.from ?? ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">עד תאריך</Label>
          <Input id="to" name="to" type="date" dir="ltr" defaultValue={filters.to ?? ""} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="overdue" value="1" defaultChecked={filters.overdue} className="size-4" />
          באיחור בלבד
        </label>
        <div className="flex items-end gap-2 lg:col-span-3 lg:justify-end">
          {hasFilters && (
            <Link href="/admin/requests" className={buttonVariants({ variant: "ghost" })}>
              ניקוי
            </Link>
          )}
          <Button type="submit">סינון</Button>
        </div>
      </form>

      {cancelled !== null && Number.isFinite(cancelled) && <p role="status" className="rounded-md bg-muted p-3 text-sm">בוטלו {cancelled} בקשות.{skipped > 0 && ` ${skipped} דולגו (כבר הסתיימו או בוטלו).`}</p>}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <p className="text-muted-foreground" aria-live="polite">{result.total} בקשות</p>
        <nav aria-label="היקף" className="flex overflow-hidden rounded-md border">
          <Link href={link({ mine: true, page: 1 })} aria-current={filters.mine ? "page" : undefined} className={`px-3 py-1.5 ${filters.mine ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>שפתחתי</Link>
          <Link href={allLink} aria-current={!filters.mine ? "page" : undefined} className={`px-3 py-1.5 ${!filters.mine ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>הכול</Link>
        </nav>
        <Link
          href={filters.followUp ? link({ followUp: undefined, page: 1 }) : link({ followUp: "pending", status: undefined, page: 1 })}
          aria-pressed={!!filters.followUp}
          className={`rounded-md border px-3 py-1.5 ${filters.followUp ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"}`}
        >
          ממתינות לטיפול אחרי חתימה
        </Link>
      </div>
      {filters.view === "board" ? <Board rows={result.rows} /> : (
      <form id="bulk" method="get" action="/api/admin/requests/export" className="space-y-3">
        {[...new URLSearchParams(filtersToQuery(filters, { page: 1 })).entries()].map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 text-sm" role="toolbar" aria-label="פעולות על בקשות">
          <span className="text-muted-foreground">סמנו שורות, או השאירו ריק לכל התוצאות ({result.total}):</span>
          {canExport && <>
          <Button type="submit" name="format" value="csv" variant="outline" size="sm">ייצוא CSV</Button>
          <Button type="submit" name="format" value="xlsx" variant="outline" size="sm">ייצוא Excel</Button>
          <Button type="submit" name="format" value="zip" variant="outline" size="sm">PDF חתומים (ZIP)</Button>
          </>}
          {canExport && exportTemplates.length > 0 && (
            <span className="flex items-center gap-1">
              <Select name="template" defaultValue="" aria-label="תבנית ייצוא" className="h-8 w-48">
                <option value="">ללא תבנית (כל השדות)</option>
                {exportTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </span>
          )}
          {canCancel && <span className="ms-auto flex items-center gap-2">
            <Input name="reason" placeholder="סיבת ביטול" className="h-8 w-40" aria-label="סיבת ביטול" />
            <Button type="submit" formAction={bulkCancelAction} formMethod="post" variant="destructive" size="sm">ביטול נבחרים</Button>
          </span>}
        </div>
      <Card className="relative overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead>
            <tr className="border-b text-start text-xs text-muted-foreground">
              <th scope="col" className="w-8 px-3 py-2"><span className="sr-only">בחירה</span><SelectAll formId="bulk" /></th>
              {([["עובד", "name"], ["ארגון", "org"], ["טופס", "pkg"], ["סטטוס", "status"], ["ממתין ל"], ["ימים בשלב"], ["התקדמות"], ["נוצרה", "created"], ["יעד", "due"]] as [string, SortKey?][]).map(([h, key]) => {
                if (!key) return <th key={h} scope="col" className="px-3 py-2 text-start font-medium">{h}</th>;
                const state = ariaSort(filters, key);
                return (
                  <th key={h} scope="col" aria-sort={state} className="px-1 py-1 text-start font-medium">
                    <Link
                      href={link({ ...nextSort(filters, key), page: 1 })}
                      className={`relative inline-flex min-h-9 items-center gap-1 rounded px-2 hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring ${state !== "none" ? "text-foreground" : ""}`}
                    >
                      {h}
                      <span aria-hidden="true" className={state === "none" ? "opacity-30" : ""}>{state === "ascending" ? "▲" : state === "descending" ? "▼" : "↕"}</span>
                      <span className="sr-only">{state === "ascending" ? "(ממוין עולה)" : state === "descending" ? "(ממוין יורד)" : "(לחץ למיון)"}</span>
                    </Link>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y">
            {result.rows.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-muted-foreground">
                  {hasFilters ? "לא נמצאו בקשות לפי הסינון." : "עדיין אין בקשות."}
                </td>
              </tr>
            )}
            {result.rows.map((r) => {
              const [label, tone] = REQUEST_STATUS_LABEL[r.status];
              return (
                <tr key={r.id}>
                  <td className="px-3 py-2"><input type="checkbox" name="id" value={r.id} aria-label={`בחירת ${r.subjectName}`} className="size-4 accent-primary" /></td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/requests/${r.id}`} className="font-medium hover:underline">
                      {r.subjectName}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{r.organizationName}</td>
                  <td className="px-3 py-2">{r.packageName}</td>
                  <td className="px-3 py-2">
                    <Badge tone={tone}>{label}</Badge>
                    {r.followUpPending && <span className="mt-1 block text-xs font-medium text-muted-foreground">ממתין: {r.followUpPending}</span>}
                  </td>
                  <td className="px-3 py-2">{r.waitingFor.length ? r.waitingFor.map((w) => `${ROLE_LABELS[w.role as StepRole] ?? w.role}${w.name ? ` (${w.name})` : ""}`).join(", ") : "—"}</td>
                  <td className="px-3 py-2">{r.daysInStep ?? "—"}</td>
                  <td className="px-3 py-2">{r.progress.total ? `${r.progress.done}/${r.progress.total}` : "—"}</td>
                  <td className="px-3 py-2">{fmt.format(r.createdAt)}</td>
                  <td className={`px-3 py-2 ${r.overdue ? "font-medium text-destructive" : ""}`}>{r.overdue && <span aria-hidden="true">⚠ </span>}{r.expiresAt ? fmt.format(r.expiresAt) : "—"}{r.overdue && <span className="sr-only"> (באיחור)</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      </form>
      )}

      {result.pageCount > 1 && (
        <nav className="flex items-center justify-center gap-3 text-sm" aria-label="עימוד">
          {page > 1 ? (
            <Link href={link({ page: page - 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>
              הקודם
            </Link>
          ) : (
            <span />
          )}
          <span>
            עמוד {page} מתוך {result.pageCount} · {PAGE_SIZE} בעמוד
          </span>
          {page < result.pageCount ? (
            <Link href={link({ page: page + 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>
              הבא
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  );
}
