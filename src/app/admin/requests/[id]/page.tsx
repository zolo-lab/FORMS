import Link from "next/link";
import { notFound } from "next/navigation";
import { FinalizeButton } from "@/components/requests/FinalizeButton";
import { RefreshLinks } from "@/components/requests/RefreshLinks";
import { Badge, Card } from "@/components/ui/card";
import { REQUEST_STATUS_LABEL, ROLE_LABELS, STEP_STATUS_LABEL } from "@/lib/workflow/labels";
import type { StepRole } from "@/lib/workflow/types";
import { getRequest } from "@/server/requests-store";

export const dynamic = "force-dynamic";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = /^[0-9a-f-]{36}$/i.test(id) ? await getRequest(id) : null;
  if (!data) notFound();
  const { request, steps, events, documents } = data;
  const fmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" });
  const [label, tone] = REQUEST_STATUS_LABEL[request.status];
  const open = steps.some((s) => (s.status === "active" || s.status === "in_progress") && s.role !== "requester");
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <Link href="/admin/requests" className="text-sm text-muted-foreground hover:underline">
        ← כל הבקשות
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{request.subjectName}</h1>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">נוצרה {fmt.format(request.createdAt)}</p>

      <section className="space-y-2">
        <h2 className="font-semibold">שלבים</h2>
        <Card className="divide-y">
          {steps.length === 0 && <p className="p-4 text-sm text-muted-foreground">הבקשה עדיין טיוטה ולא נשלחה.</p>}
          {steps.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="font-medium">{ROLE_LABELS[s.role as StepRole]}</span>
              <span className="text-muted-foreground">{s.assigneeName ?? s.assigneeEmail ?? ""}</span>
              <Badge className="ms-auto" tone={s.status === "completed" ? "success" : s.status === "active" || s.status === "in_progress" ? "warning" : "muted"}>
                {STEP_STATUS_LABEL[s.status] ?? s.status}
              </Badge>
            </div>
          ))}
        </Card>
      </section>

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
                      פתיחת ה-PDF
                    </a>
                    <span className="ms-auto text-xs text-muted-foreground" dir="ltr" title="SHA-256">{d.finalSha256?.slice(0, 16)}…</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">עדיין לא נוצר</span>
                )}
              </div>
            ))}
          </Card>
          {documents.some((d) => !d.finalFileId) && <FinalizeButton requestId={request.id} />}
        </section>
      )}

      {open && (
        <section className="space-y-2">
          <h2 className="font-semibold">שיתוף קישור</h2>
          <RefreshLinks requestId={request.id} />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">היסטוריה</h2>
        <ul className="space-y-1 text-sm text-muted-foreground">
          {events.map((e) => (
            <li key={e.id}>
              {fmt.format(e.createdAt)} · {e.type}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
