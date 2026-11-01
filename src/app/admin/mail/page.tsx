import { redirect } from "next/navigation";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { MailTabs } from "./MailTabs";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { isAdmin } from "@/lib/auth/permissions";
import { currentUser } from "@/server/users-store";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: "success" | "warning" | "muted" }> = {
  sent: { label: "נשלח", tone: "success" },
  queued: { label: "בתור", tone: "muted" },
  failed: { label: "נכשל", tone: "warning" },
};

const KIND: Record<string, string> = {
  sent_to_creator: "אישור שליחה",
  step_invite: "הזמנה לשלב",
  reminder: "תזכורת",
  step_done: "התקדמות",
  completed: "הסתיים",
  declined: "נדחה",
  returned: "הוחזר לשלב קודם",
  completion_docs: "מסמכים חתומים",
  otp: "קוד אימות",
  weekly_digest: "סיכום שבועי",
};

const when = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" });

/** Links in a message body (the signing link is what a tester needs to follow the chain). */
const linksIn = (body: string) => [...new Set(body.match(/https?:\/\/[^\s"'<>)]+/g) ?? [])];

/** "מרכז מיילים": every message the system sent or is about to send, newest first, with its text and links. Admins only. */
export default async function MailCenterPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string }> }) {
  if (!isAdmin(await currentUser())) redirect("/admin/inbox");
  const { q = "", kind = "" } = await searchParams;
  const term = q.trim();
  const rows = await db
    .select({ n: schema.notifications, subject: schema.requests.subjectName })
    .from(schema.notifications)
    .leftJoin(schema.requests, eq(schema.requests.id, schema.notifications.requestId))
    .where(
      and(
        term ? or(ilike(schema.notifications.to, `%${term}%`), ilike(schema.notifications.subject, `%${term}%`), ilike(schema.requests.subjectName, `%${term}%`)) : undefined,
        kind ? eq(schema.notifications.templateKey, kind) : undefined,
      ),
    )
    .orderBy(desc(schema.notifications.createdAt))
    .limit(100);
  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <PageHeader
        title="מרכז מיילים"
        description="כל ההודעות שהמערכת שלחה, מהחדשה לישנה: למי, מה, ומתי. הקישור שבהודעה נפתח בחלון חדש – כך אפשר לעבור על שרשרת החתימות בלי לגשת לתיבות הדואר. הקישורים כאן אמיתיים: לא לשתף את הדף."
      />
      <MailTabs current="messages" />
      <form className="flex flex-wrap items-end gap-2" role="search">
        <Input name="q" defaultValue={term} placeholder="חיפוש לפי נמען, נושא או שם עובד" aria-label="חיפוש הודעות" className="max-w-sm" />
        <Select name="kind" defaultValue={kind} aria-label="סוג הודעה" className="max-w-48">
          <option value="">כל הסוגים</option>
          {Object.entries(KIND).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </Select>
        <Button type="submit" variant="outline">חיפוש</Button>
      </form>
      <p className="text-sm text-muted-foreground">{rows.length === 100 ? "100 ההודעות האחרונות" : `${rows.length} הודעות`}</p>
      {rows.length === 0 && <Card className="p-4 text-sm text-muted-foreground">אין הודעות.</Card>}
      <ul className="space-y-2">
        {rows.map(({ n, subject }) => {
          const st = STATUS[n.status] ?? STATUS.queued!;
          const links = linksIn(n.body);
          return (
            <li key={n.id}>
              <Card className="p-0">
                <details className="group">
                  <summary className="flex min-h-12 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <span className="min-w-0 flex-1 truncate font-medium">{n.subject || KIND[n.templateKey] || n.templateKey}</span>
                    <bdi dir="ltr" className="truncate text-sm text-muted-foreground">{n.to}</bdi>
                    <span className="text-xs text-muted-foreground">{when.format(n.createdAt)}</span>
                  </summary>
                  <div className="space-y-3 border-t px-4 py-3 text-sm">
                    <p className="text-muted-foreground">
                      {KIND[n.templateKey] ?? n.templateKey}
                      {subject ? ` · ${subject}` : ""}
                      {n.channel !== "email" ? ` · ${n.channel}` : ""}
                      {n.error ? ` · שגיאה: ${n.error}` : ""}
                    </p>
                    <p className="whitespace-pre-wrap break-words rounded-md bg-muted p-3">{n.body}</p>
                    {links.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {links.map((l) => (
                          <a key={l} href={l} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                            {l.includes("/s/") ? "פתיחת הקישור לחתימה" : "פתיחת הקישור"}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              </Card>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
