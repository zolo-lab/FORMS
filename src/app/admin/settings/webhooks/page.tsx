import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WEBHOOK_EVENTS, WEBHOOK_EVENT_LABELS } from "@/lib/webhooks/events";
import { listTemplates } from "@/server/forms-store";
import { listOrgs } from "@/server/orgs-store";
import { listWebhooks } from "@/server/webhooks";
import { createWebhookAction, deleteWebhookAction, testWebhookAction, toggleWebhookAction } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  org: "יש לבחור ארגון",
  url: "הכתובת חייבת להיות https ציבורית (לא localhost ולא רשת פנימית)",
  events: "יש לבחור לפחות אירוע אחד",
};

export default async function WebhooksPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; test?: string; status?: string }> }) {
  const { error, saved, test, status } = await searchParams;
  const [hooks, orgs, templates] = await Promise.all([listWebhooks(), listOrgs(), listTemplates()]);
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const tplName = new Map(templates.map((t) => [t.id, t.title]));
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <h1 className="text-2xl font-bold">Webhooks</h1>
      <p className="text-sm text-muted-foreground">
        כשאירוע קורה (בקשה הושלמה, שלב הושלם, בקשה נדחתה) נשלחת בקשת POST עם JSON לכתובת שתגדירו, למשל תרחיש ב-Make. הבקשה חתומה ב-HMAC-SHA256 על <code dir="ltr">timestamp.body</code> בכותרת{" "}
        <code dir="ltr">x-forms-signature</code>, וקישורי ה-PDF בתוכה תקפים 24 שעות. נכשל? ננסה עד 3 פעמים.
      </p>
      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{ERRORS[error] ?? "שגיאה"}</p>}
      {saved && <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success">נשמר</p>}
      {test && <p role="status" className={`rounded-md p-3 text-sm ${test === "ok" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>{test === "ok" ? "בדיקת החיבור הצליחה" : `בדיקת החיבור נכשלה${status ? ` (סטטוס ${status})` : ""}`}</p>}

      <Card className="divide-y">
        {hooks.length === 0 && <p className="p-4 text-sm text-muted-foreground">עדיין אין webhooks.</p>}
        {hooks.map((h) => (
          <div key={h.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium" dir="ltr">{h.url}</span>
              <Badge tone={h.active ? "success" : "muted"}>{h.active ? "פעיל" : "מושבת"}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {orgName.get(h.organizationId)} · {h.templateId ? `רק טופס: ${tplName.get(h.templateId) ?? "?"}` : "כל הטפסים"} · {h.events.map((e) => WEBHOOK_EVENT_LABELS[e as keyof typeof WEBHOOK_EVENT_LABELS] ?? e).join(", ")}
            </p>
            <details className="text-sm">
              <summary className="cursor-pointer text-primary">הצגת הסוד לאימות חתימה</summary>
              <code className="mt-1 block break-all rounded-md bg-muted p-2" dir="ltr">{h.secret}</code>
            </details>
            <div className="flex flex-wrap gap-2">
              <form action={testWebhookAction}><input type="hidden" name="id" value={h.id} /><Button size="sm" variant="outline" type="submit">שליחת בדיקה</Button></form>
              <form action={toggleWebhookAction}><input type="hidden" name="id" value={h.id} /><input type="hidden" name="active" value={h.active ? "0" : "1"} /><Button size="sm" variant="outline" type="submit">{h.active ? "השבתה" : "הפעלה"}</Button></form>
              <form action={deleteWebhookAction}><input type="hidden" name="id" value={h.id} /><Button size="sm" variant="ghost" className="text-destructive" type="submit">מחיקה</Button></form>
            </div>
          </div>
        ))}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold">Webhook חדש</h2>
        <form action={createWebhookAction} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="wh-org">ארגון</Label>
            <Select id="wh-org" name="organizationId" required>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="wh-tpl">טופס (אופציונלי)</Label>
            <Select id="wh-tpl" name="templateId" defaultValue="">
              <option value="">כל הטפסים</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="wh-url">כתובת (https)</Label>
            <Input id="wh-url" name="url" type="url" dir="ltr" placeholder="https://hook.eu1.make.com/…" required />
          </div>
          <fieldset className="space-y-1 sm:col-span-2">
            <legend className="text-sm font-medium">אירועים</legend>
            <div className="flex flex-wrap gap-4">
              {WEBHOOK_EVENTS.map((e) => (
                <label key={e} className="flex items-center gap-2 text-sm">
                  <Checkbox name="events" value={e} defaultChecked={e === "request.completed"} />
                  {WEBHOOK_EVENT_LABELS[e]} <span className="text-muted-foreground" dir="ltr">({e})</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="sm:col-span-2"><Button type="submit">יצירה</Button></div>
        </form>
      </Card>
    </main>
  );
}
