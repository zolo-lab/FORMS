import Link from "next/link";
import { notFound } from "next/navigation";
import { FinalizeButton } from "@/components/requests/FinalizeButton";
import { driveEnabled } from "@/server/drive";
import { RefreshLinks } from "@/components/requests/RefreshLinks";
import { RequestActions } from "@/components/requests/RequestActions";
import { Button } from "@/components/ui/button";
import { discardDraftAction, sendDraftAction } from "../actions";
import { Badge, Card } from "@/components/ui/card";
import { eventLabel } from "@/lib/requests/list";
import { REQUEST_STATUS_LABEL, ROLE_LABELS, STEP_STATUS_LABEL } from "@/lib/workflow/labels";
import type { StepRole } from "@/lib/workflow/types";
import { requestAnswerItems } from "@/server/dashboard-store";
import { getRequest } from "@/server/requests-store";

export const dynamic = "force-dynamic";

const ACTOR: Record<string, string> = { user: "מנהל", signer: "חותם", system: "מערכת", api: "API" };
const stepTone = (s: string) => (s === "completed" ? "success" : s === "active" || s === "in_progress" ? "warning" : "muted");

export default async function RequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const data = /^[0-9a-f-]{36}$/i.test(id) ? await getRequest(id) : null;
  if (!data) notFound();
  const { request, steps, events, documents } = data;
  const answers = await requestAnswerItems(id);
  const fmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" });
  const [label, tone] = REQUEST_STATUS_LABEL[request.status];
  const roleOf = (r: string) => ROLE_LABELS[r as StepRole] ?? r;
  const openSteps = steps.filter((s) => (s.status === "active" || s.status === "in_progress") && s.role !== "requester");
  const live = request.status === "in_progress" || request.status === "returned";

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <Link href="/admin/requests" className="text-sm text-muted-foreground hover:underline">
        ← כל הבקשות
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{request.subjectName}</h1>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        נוצרה {fmt.format(request.createdAt)}
        {request.expiresAt && ` · תוקף עד ${fmt.format(request.expiresAt)}`}
        {request.cancelReason && ` · סיבת ביטול: ${request.cancelReason}`}
      </p>

      <section className="space-y-2" aria-label="מסלול">
        <h2 className="font-semibold">מסלול החתימות</h2>
        {steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">הבקשה עדיין טיוטה ולא נשלחה.</p>
        ) : (
          <ol className="flex flex-wrap items-stretch gap-2">
            {steps.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2">
                <Card className={`min-w-36 space-y-1 p-3 text-sm ${s.status === "active" || s.status === "in_progress" ? "border-primary" : ""}`}>
                  <p className="font-medium">{roleOf(s.role)}</p>
                  <p className="truncate text-xs text-muted-foreground">{s.assigneeName ?? s.assigneeEmail ?? "—"}</p>
                  <Badge tone={stepTone(s.status)}>{STEP_STATUS_LABEL[s.status] ?? s.status}</Badge>
                  {s.completedAt && <p className="text-xs text-muted-foreground">{fmt.format(s.completedAt)}</p>}
                </Card>
                {i < steps.length - 1 && <span aria-hidden className="text-muted-foreground">←</span>}
              </li>
            ))}
          </ol>
        )}
      </section>

      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error === "send" ? "השליחה נכשלה. בדקו שהערכה מוגדרת ושכל הטפסים בה פורסמו." : "המחיקה נכשלה."}</p>}

      {request.status === "draft" && (
        <section className="space-y-2" aria-label="טיוטה">
          <h2 className="font-semibold">הבקשה עדיין לא נשלחה</h2>
          <div className="flex gap-2">
            <form action={sendDraftAction}>
              <input type="hidden" name="id" value={request.id} />
              <Button type="submit" size="sm">שליחה עכשיו</Button>
            </form>
            <form action={discardDraftAction}>
              <input type="hidden" name="id" value={request.id} />
              <Button type="submit" size="sm" variant="destructive">מחיקת הטיוטה</Button>
            </form>
          </div>
        </section>
      )}

      {(live || request.status === "expired") && (
        <section className="space-y-2" aria-label="פעולות">
          <h2 className="font-semibold">פעולות</h2>
          <RequestActions
            requestId={request.id}
            canExtend
            canCancel={live}
            openSteps={openSteps.map((s) => ({ id: s.id, label: roleOf(s.role), name: s.assigneeName ?? "", email: s.assigneeEmail ?? "", phone: s.assigneePhone ?? "" }))}
          />
        </section>
      )}

      {request.status === "completed" && (
        <section className="space-y-2">
          <h2 className="font-semibold">מסמכים חתומים</h2>
          <Card className="divide-y">
            {documents.length === 0 && <p className="p-4 text-sm text-muted-foreground">אין מסמכים בבקשה.</p>}
            {documents.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <span className="font-medium">{d.title}</span>
                {d.finalFileId ? (
                  <>
                    <a className="text-primary hover:underline" href={`/api/admin/requests/${request.id}/documents/${d.id}`} target="_blank" rel="noopener noreferrer">
                      פתיחת ה-PDF (כולל אסמכתא)
                    </a>
                    {d.driveUrl ? (
                      <a className="text-primary hover:underline" href={d.driveUrl} target="_blank" rel="noopener noreferrer">
                        פתיחה בארכיון (Drive)
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">טרם בארכיון</span>
                    )}
                    <span className="ms-auto text-xs text-muted-foreground" dir="ltr" title={`SHA-256 של הקובץ המלא: ${d.finalSha256 ?? ""}`}>
                      {d.finalSha256?.slice(0, 16)}…
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">עדיין לא נוצר</span>
                )}
              </div>
            ))}
          </Card>
          {documents.some((d) => !d.finalFileId) && <FinalizeButton requestId={request.id} />}
          {driveEnabled() && documents.every((d) => d.finalFileId) && documents.some((d) => !d.driveUrl) && <FinalizeButton requestId={request.id} label="העלאה לארכיון ב-Drive" />}
        </section>
      )}

      {openSteps.length > 0 && live && (
        <section className="space-y-2">
          <h2 className="font-semibold">שיתוף קישור</h2>
          <RefreshLinks requestId={request.id} />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">תשובות</h2>
        {answers.length === 0 ? (
          <p className="text-sm text-muted-foreground">עדיין לא נאספו תשובות.</p>
        ) : (
          <Card className="p-3">
            <dl className="grid grid-cols-[minmax(8rem,14rem)_1fr] gap-x-4 gap-y-1 text-sm">
              {answers.map((a, i) => (
                <div key={i} className="contents">
                  <dt className="text-muted-foreground">{a.label}</dt>
                  <dd className="whitespace-pre-line break-words">{a.text}</dd>
                </div>
              ))}
            </dl>
          </Card>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">היסטוריה</h2>
        <ol className="space-y-1.5 border-s ps-4 text-sm">
          {events.map((e) => (
            <li key={e.id} className="relative">
              <span aria-hidden className="absolute -start-[1.3rem] top-1.5 size-2 rounded-full bg-primary" />
              <span>{eventLabel(e.type, (e.payload ?? {}) as Record<string, unknown>)}</span>
              <span className="ms-2 text-xs text-muted-foreground">
                {fmt.format(e.createdAt)} · {ACTOR[e.actorType] ?? e.actorType}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
