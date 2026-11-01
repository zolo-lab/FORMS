import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { isAdmin } from "@/lib/auth/permissions";
import { RECIPIENT_LABELS, TRIGGERS, effectiveTemplate, effectiveTrigger } from "@/lib/notifications/triggers";
import { loadTriggerSettings, orgAddressLists, triggerCounts } from "@/server/mail-triggers";
import { listOrgs } from "@/server/orgs-store";
import { currentUser } from "@/server/users-store";
import { MailTabs } from "../MailTabs";
import { resetTemplateAction, resetTriggerAction, saveOrgAddressesAction, saveTemplateAction, saveTriggerAction } from "./actions";
import { TemplateEditor } from "./TemplateEditor";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  no_recipients: "טריגר פעיל צריך לפחות נמען אחד.",
  no_fixed: "סימנת \"כתובות קבועות\" בלי לכתוב כתובת תקינה.",
  locked: "את הטריגר הזה אי אפשר לשנות.",
  unknown: "טריגר לא מוכר.",
  org: "עמותה לא תקינה.",
  text_empty: "נושא וגוף ההודעה לא יכולים להיות ריקים.",
  text_too_long: "הנוסח ארוך מדי (נושא עד 200 תווים, גוף עד 5000).",
  text_locked: "את הנוסח הזה אי אפשר לשנות.",
  text_unknown: "טריגר לא מוכר.",
};

const SOURCE: Record<string, string> = {
  default: "ברירת מחדל",
  all: "הגדרה לכל העמותות",
  org: "הגדרה לעמותה הזו",
};

/** "טריגרים": every e-mail the system sends, when, to whom, on/off – for all organizations or one. Admins only. */
export default async function MailTriggersPage({ searchParams }: { searchParams: Promise<{ org?: string; saved?: string; error?: string; key?: string }> }) {
  if (!isAdmin(await currentUser())) redirect("/admin/inbox");
  const { org: orgParam = "", saved, error, key: errorKey } = await searchParams;
  const orgs = (await listOrgs()).filter((o) => o.active);
  const org = orgs.find((o) => o.id === orgParam) ?? null;
  const orgId = org?.id ?? null;
  const [{ settings, templates }, counts, addresses] = await Promise.all([loadTriggerSettings(orgId), triggerCounts(orgId), orgId ? orgAddressLists(orgId) : Promise.resolve(null)]);

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <PageHeader title="מרכז מיילים" description="אילו מיילים המערכת שולחת, מתי ולמי. אפשר לכבות טריגר, לבחור מי מקבל, ולהגדיר לכל העמותות או לעמותה מסוימת (הגדרה של עמותה גוברת)." />
      <MailTabs current="triggers" />

      <form className="flex flex-wrap items-end gap-2" method="get">
        <div className="space-y-1">
          <Label htmlFor="org">הגדרות עבור</Label>
          <Select id="org" name="org" defaultValue={orgId ?? ""} className="min-w-56">
            <option value="">כל העמותות</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="outline">הצגה</Button>
      </form>

      {error && !errorKey && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{ERRORS[error] ?? "שגיאה"}</p>}

      {org && addresses ? (
        <Card className="space-y-3 p-4">
          <h2 className="font-semibold">כתובות של {org.name}</h2>
          <p className="text-sm text-muted-foreground">טריגרים שבהם סימנת &quot;מזכירות העמותה&quot; או &quot;הנהלת חשבונות&quot; נשלחים לכתובות האלה. כתובת בכל שורה, או מופרדות בפסיק.</p>
          <form action={saveOrgAddressesAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="org" value={org.id} />
            <div className="space-y-1">
              <Label htmlFor="secretariat">מזכירות העמותה</Label>
              <Textarea id="secretariat" name="secretariat" dir="ltr" rows={3} defaultValue={addresses.secretariat.join("\n")} placeholder="office@example.org.il" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bookkeeping">הנהלת חשבונות</Label>
              <Textarea id="bookkeeping" name="bookkeeping" dir="ltr" rows={3} defaultValue={addresses.bookkeeping.join("\n")} />
            </div>
            <div className="sm:col-span-2">
              <SubmitButton saved={saved === "addresses"}>שמירת הכתובות</SubmitButton>
            </div>
          </form>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">כתובות המזכירות והנהלת החשבונות מוגדרות לכל עמותה בנפרד: בחרו עמותה למעלה.</p>
      )}

      <ul className="space-y-3">
        {TRIGGERS.map((def) => {
          const eff = effectiveTrigger(def.key, settings, orgId);
          const text = def.locked ? null : effectiveTemplate(def.key, templates, orgId);
          const c = counts[def.key] ?? { sent: 0, failed: 0, queued: 0 };
          const failedHere = error && errorKey === def.key;
          return (
            <li key={def.key}>
              <Card className="space-y-3 p-4" aria-labelledby={`t-${def.key}`}>
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                  <div className="min-w-0 flex-1">
                    <h2 id={`t-${def.key}`} className="font-semibold">{def.label}</h2>
                    <p className="text-sm text-muted-foreground">{def.when}</p>
                  </div>
                  <Badge tone={eff.enabled ? "success" : "muted"}>{eff.enabled ? "פעיל" : "כבוי"}</Badge>
                  <Badge tone="muted">{SOURCE[eff.source]}</Badge>
                </div>
                <p className="text-sm">
                  <Link href={`/admin/mail?kind=${def.key}`} className="underline-offset-4 hover:underline">
                    ב-30 הימים האחרונים: {c.sent} נשלחו
                    {c.queued ? ` · ${c.queued} בתור` : ""}
                    {c.failed ? ` · ${c.failed} נכשלו` : ""}
                  </Link>
                </p>

                {def.locked ? (
                  <p className="text-sm text-muted-foreground">נשלח תמיד ל{RECIPIENT_LABELS.signer}. אי אפשר לכבות אותו, כי בלעדיו אי אפשר להיכנס לחתום.</p>
                ) : (
                  <form action={saveTriggerAction} className="space-y-3 border-t pt-3">
                    <input type="hidden" name="org" value={orgId ?? ""} />
                    <input type="hidden" name="key" value={def.key} />
                    <label className="flex min-h-11 w-fit items-center gap-2 font-medium">
                      <Checkbox name="enabled" defaultChecked={eff.enabled} /> פעיל – לשלוח את המייל הזה
                    </label>
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium">מי מקבל</legend>
                      <div className="flex flex-wrap gap-2">
                        {def.allowed.map((r) => (
                          <label key={r} className="flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                            <Checkbox name="recipients" value={r} defaultChecked={eff.recipients.includes(r)} disabled={def.allowed.length === 1} />
                            {RECIPIENT_LABELS[r]}
                          </label>
                        ))}
                        {/* A single allowed recipient is fixed: send it along with the form, the checkbox is only shown. */}
                        {def.allowed.length === 1 && <input type="hidden" name="recipients" value={def.allowed[0]} />}
                      </div>
                      {def.allowed.includes("fixed") && (
                        <div className="space-y-1">
                          <Label htmlFor={`fixed-${def.key}`}>כתובות קבועות (אם סימנת)</Label>
                          <Textarea id={`fixed-${def.key}`} name="fixed" dir="ltr" rows={2} defaultValue={eff.fixedRecipients.map((p) => p.email).join("\n")} />
                        </div>
                      )}
                    </fieldset>
                    {failedHere && !error.startsWith("text_") && <p role="alert" className="text-sm text-destructive">{ERRORS[error] ?? "שגיאה"}</p>}
                    <div className="flex flex-wrap items-center gap-2">
                      <SubmitButton name="do" value="save" saved={saved === def.key}>שמירה</SubmitButton>
                      {eff.source === (orgId ? "org" : "all") && (
                        <SubmitButton variant="outline" formAction={resetTriggerAction} name="do" value="reset">
                          {orgId ? "חזרה להגדרה הכללית" : "חזרה לברירת המחדל"}
                        </SubmitButton>
                      )}
                    </div>
                  </form>
                )}

                {text && (
                  <details className="rounded-md border" open={saved === `text-${def.key}` || (!!failedHere && error?.startsWith("text_")) || undefined}>
                    <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-2 px-3 text-sm font-medium">
                      נוסח המייל
                      <Badge tone="muted">{SOURCE[text.source]}</Badge>
                      <span className="min-w-0 truncate font-normal text-muted-foreground">{text.subject}</span>
                    </summary>
                    <form action={saveTemplateAction} className="space-y-3 border-t p-3">
                      <input type="hidden" name="org" value={orgId ?? ""} />
                      <input type="hidden" name="key" value={def.key} />
                      <TemplateEditor key={`${text.source}-${text.subject}-${text.body}`} id={`tx-${def.key}`} subject={text.subject} body={text.body} vars={def.vars} />
                      {failedHere && error?.startsWith("text_") && <p role="alert" className="text-sm text-destructive">{ERRORS[error] ?? "שגיאה"}</p>}
                      <div className="flex flex-wrap items-center gap-2">
                        <SubmitButton name="do" value="save" saved={saved === `text-${def.key}`}>שמירת הנוסח</SubmitButton>
                        {text.source === (orgId ? "org" : "all") && (
                          <SubmitButton variant="outline" formAction={resetTemplateAction} formNoValidate name="do" value="reset">
                            {orgId ? "חזרה לנוסח הכללי" : "חזרה לנוסח ברירת המחדל"}
                          </SubmitButton>
                        )}
                      </div>
                    </form>
                  </details>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
