import Link from "next/link";
import { notFound } from "next/navigation";
import { canSeeRequest, currentUser } from "@/server/users-store";
import { hasGrant } from "@/lib/auth/permissions";
import { FinalizeButton } from "@/components/requests/FinalizeButton";
import { RetryDelivery } from "@/components/requests/RetryDelivery";
import { requestDeliveries, requestParts } from "@/server/deliver";
import { driveEnabled, driveProblem } from "@/server/drive";
import { RefreshLinks } from "@/components/requests/RefreshLinks";
import { RequestActions } from "@/components/requests/RequestActions";
import { SubmitButton } from "@/components/ui/submit-button";
import { discardDraftAction, sendDraftAction } from "../actions";
import { Badge, Card } from "@/components/ui/card";
import { eventLabel } from "@/lib/requests/list";
import { buildTimeline } from "@/lib/requests/timeline";
import { RequestTimeline } from "@/components/requests/RequestTimeline";
import { REQUEST_STATUS_LABEL, runStepLabel } from "@/lib/workflow/labels";
import { requestDocumentView, uploadedFiles } from "@/server/dashboard-store";
import { DocumentViewer } from "@/components/requests/DocumentViewer";
import { getRequest } from "@/server/requests-store";
import { FollowUpCard } from "@/components/requests/FollowUpCard";
import { RemindButton } from "@/components/requests/RemindButton";
import { normalizeFollowUpStatuses, type FollowUpState } from "@/lib/requests/follow-up";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const ACTOR: Record<string, string> = { user: "מנהל", signer: "חותם", system: "מערכת", api: "API" };

export default async function RequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const data = /^[0-9a-f-]{36}$/i.test(id) ? await getRequest(id) : null;
  if (!data) notFound();
  if (!(await canSeeRequest(id))) notFound();
  const me = await currentUser();
  const { request, steps, events, documents } = data;
  const docView = await requestDocumentView(id);
  const files = await uploadedFiles(id);
  // Where each document and part was sent ("עיבוד טופס").
  const deliveries = await requestDeliveries(id);
  // Parts the form cuts out of its signed documents, offered for download (cut on the way out, never stored).
  const parts = request.status === "completed" ? await requestParts(id) : [];
  const fmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" });
  const [label, tone] = REQUEST_STATUS_LABEL[request.status];
  const openSteps = steps.filter((s) => (s.status === "active" || s.status === "in_progress") && s.role !== "requester");
  const live = request.status === "in_progress" || request.status === "returned";
  const [pkg] = await db.select({ followUpStatuses: schema.packageTemplates.followUpStatuses }).from(schema.packageTemplates).where(eq(schema.packageTemplates.id, request.packageTemplateId));
  const followUps = normalizeFollowUpStatuses(pkg?.followUpStatuses);
  const timeline = buildTimeline(steps, request.status, { viewerEmail: me?.email });
  // Which step fills a field of each role (for "טרם מולא · שלב 3 · דנה").
  const stepOf: Record<string, string> = {};
  for (const s of [...steps].sort((a, b) => a.order - b.order)) stepOf[s.role] ??= runStepLabel(s);
  const doneSteps = [...steps].filter((s) => s.status === "completed").sort((a, b) => a.order - b.order);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <Link href="/admin/requests" className="text-sm text-muted-foreground hover:underline">
        ← היסטוריית טפסים
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

      <section aria-label="מסלול">
        <RequestTimeline timeline={timeline} />
      </section>

      {live && openSteps.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">ממתין ל{runStepLabel(openSteps[0]!)}:</span>
          <RemindButton requestId={request.id} subject={request.subjectName} />
        </div>
      )}

      {request.status === "completed" && followUps.length > 0 && (
        <FollowUpCard requestId={request.id} statuses={followUps} state={(request.followUp ?? {}) as FollowUpState} canMark={hasGrant(me, "followUp")} />
      )}

      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error === "followup" ? "אין לך הרשאה לסמן טיפול אחרי חתימה." : error === "send" ? "השליחה נכשלה. בדקו ששלבי הטופס מוגדרים ושהטופס פורסם." : "המחיקה נכשלה."}</p>}

      {request.status === "draft" && (
        <section className="space-y-2" aria-label="טיוטה">
          <h2 className="font-semibold">הבקשה עדיין לא נשלחה</h2>
          <div className="flex gap-2">
            <form action={sendDraftAction}>
              <input type="hidden" name="id" value={request.id} />
              <SubmitButton size="sm">שליחה עכשיו</SubmitButton>
            </form>
            <form action={discardDraftAction}>
              <input type="hidden" name="id" value={request.id} />
              <SubmitButton size="sm" variant="destructive">מחיקת הטיוטה</SubmitButton>
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
            canCancel={live && hasGrant(me, "cancel")}
            openSteps={openSteps.map((s) => ({ id: s.id, label: runStepLabel(s), name: s.assigneeName ?? "", email: s.assigneeEmail ?? "", phone: s.assigneePhone ?? "" }))}
            doneSteps={live ? doneSteps.filter((d) => openSteps.some((o) => d.order < o.order)).map((d) => ({ id: d.id, label: runStepLabel(d) })) : []}
          />
        </section>
      )}

      {request.status !== "draft" && <DocumentViewer requestId={request.id} docs={docView} files={files} stepOf={stepOf} />}

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
          {parts.length > 0 && (
            <Card className="divide-y">
              <p className="px-3 pt-3 text-xs text-muted-foreground">
                חלקים מתוך המסמך החתום. נחתכים בהורדה עצמה, בלי עמוד האסמכתא.
              </p>
              {parts.map((p) => (
                <div key={p.partId} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{`עמודים ${p.pages}`}</span>
                  <a className="text-primary hover:underline" href={`/api/admin/requests/${request.id}/parts/${p.partId}?inline=1`} target="_blank" rel="noopener noreferrer">
                    תצוגה
                  </a>
                  <a className="text-primary hover:underline" href={`/api/admin/requests/${request.id}/parts/${p.partId}`}>
                    הורדה
                  </a>
                </div>
              ))}
            </Card>
          )}
          {documents.some((d) => !d.finalFileId) && <FinalizeButton requestId={request.id} />}
          {!driveEnabled() && documents.some((d) => !d.driveUrl) && driveProblem() && (
            <p className="text-xs text-muted-foreground">ארכיון Drive כבוי: {driveProblem()}.</p>
          )}
          {driveEnabled() && documents.every((d) => d.finalFileId) && documents.some((d) => !d.driveUrl) && <FinalizeButton requestId={request.id} label="העלאה לארכיון ב-Drive" />}

          {deliveries.length > 0 && (
            <section className="space-y-2" aria-labelledby="deliveries-h">
              <h3 id="deliveries-h" className="font-semibold">עיבוד: לאן נשלח</h3>
              <Card className="divide-y">
                {deliveries.map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                    <span className={d.status === "failed" ? "text-destructive" : "text-success"} aria-hidden>{d.status === "failed" ? "✕" : "✓"}</span>
                    <span className="font-medium">{d.target}</span>
                    <span className="text-xs text-muted-foreground">{d.documentIds.length} קבצים</span>
                    {d.url && <a className="text-primary hover:underline" href={d.url} target="_blank" rel="noopener noreferrer">פתיחה</a>}
                    <span className="text-xs text-muted-foreground">{fmt.format(d.createdAt)}</span>
                    {d.status === "failed" && (
                      <>
                        <span className="text-xs text-destructive">{d.error}</span>
                        <span className="ms-auto"><RetryDelivery requestId={request.id} destinationId={d.destinationId} /></span>
                      </>
                    )}
                  </div>
                ))}
              </Card>
            </section>
          )}
        </section>
      )}

      {openSteps.length > 0 && live && (
        <section className="space-y-2">
          <h2 className="font-semibold">שיתוף קישור</h2>
          <RefreshLinks requestId={request.id} />
        </section>
      )}

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
