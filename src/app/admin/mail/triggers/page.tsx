import Link from "next/link";
import { redirect } from "next/navigation";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/card";
import { Checkbox, Radio } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { isAdmin } from "@/lib/auth/permissions";
import { WEEKDAY_NAMES, describeSchedule } from "@/lib/notifications/open-summary";
import { RECIPIENT_LABELS, TRIGGERS, effectiveTemplate, effectiveTrigger, type EffectiveTrigger, type TriggerDef } from "@/lib/notifications/triggers";
import { loadTriggerSettings, orgAddressLists, triggerCounts } from "@/server/mail-triggers";
import { listOrgs } from "@/server/orgs-store";
import { currentUser } from "@/server/users-store";
import { cn } from "@/lib/utils";
import { MailTabs } from "../MailTabs";
import { resetTemplateAction, resetTriggerAction, saveOrgAddressesAction, saveTemplateAction, saveTriggerAction, sendSummaryNowAction } from "./actions";
import { TemplateEditor } from "./TemplateEditor";
import { TriggerToggle } from "./TriggerToggle";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  no_recipients: "טריגר פעיל צריך לפחות נמען אחד.",
  no_fixed: "סימנת \"כתובות קבועות\" בלי לכתוב כתובת תקינה.",
  locked: "את הטריגר הזה אי אפשר לשנות.",
  unknown: "טריגר לא מוכר.",
  org: "עמותה לא תקינה.",
  text_empty: "נושא ועיצוב המייל לא יכולים להיות ריקים.",
  text_too_long: "הנוסח ארוך מדי (נושא עד 200 תווים, עיצוב עד 30,000).",
  text_locked: "את הנוסח הזה אי אפשר לשנות.",
  text_unknown: "טריגר לא מוכר.",
  schedule: "בחרו לפחות יום אחד ושעה.",
  nothing: "לא נשלח: אין בקשות פתוחות, או שאין לטריגר נמענים (כתובות מזכירות למעלה).",
};

const SOURCE: Record<string, string> = {
  default: "ברירת מחדל",
  all: "הגדרה לכל העמותות",
  org: "הגדרה לעמותה",
};

type Counts = { sent: number; failed: number; queued: number };

const recipientsText = (def: TriggerDef, eff: EffectiveTrigger) =>
  eff.recipients.length ? eff.recipients.map((r) => (r === "fixed" && eff.fixedRecipients.length ? `${RECIPIENT_LABELS.fixed} (${eff.fixedRecipients.length})` : RECIPIENT_LABELS[r])).join(" · ") : def.locked ? RECIPIENT_LABELS.signer : "—";

/** "טריגרים": every e-mail the system sends – a compact list; "עריכה" opens a side panel with whom, when and the design. Admins only. */
export default async function MailTriggersPage({ searchParams }: { searchParams: Promise<{ org?: string; saved?: string; error?: string; key?: string; edit?: string }> }) {
  if (!isAdmin(await currentUser())) redirect("/admin/inbox");
  const { org: orgParam = "", saved, error, key: errorKey, edit } = await searchParams;
  const orgs = (await listOrgs()).filter((o) => o.active);
  const org = orgs.find((o) => o.id === orgParam) ?? null;
  const orgId = org?.id ?? null;
  const [{ settings, templates }, counts, addresses] = await Promise.all([loadTriggerSettings(orgId), triggerCounts(orgId), orgId ? orgAddressLists(orgId) : Promise.resolve(null)]);
  const listHref = `/admin/mail/triggers${orgId ? `?org=${orgId}` : ""}`;
  const editHref = (key: string) => `/admin/mail/triggers?${orgId ? `org=${orgId}&` : ""}edit=${key}`;
  const editing = TRIGGERS.find((t) => t.key === edit);

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <PageHeader title="מרכז מיילים" description="אילו מיילים המערכת שולחת, מתי ולמי. הגדרה לעמותה גוברת על ההגדרה לכל העמותות." />
      <MailTabs current="triggers" />

      <div className="flex flex-wrap items-end justify-between gap-3">
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
        {org && addresses && (
          <details className="w-full rounded-lg border bg-card sm:w-auto sm:min-w-96" open={saved === "addresses" || undefined}>
            <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">
              כתובות מזכירות והנהלת חשבונות · {addresses.secretariat.length + addresses.bookkeeping.length || "לא הוגדרו"}
            </summary>
            <form action={saveOrgAddressesAction} className="grid gap-3 border-t p-3 sm:grid-cols-2">
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
                <SubmitButton size="sm" saved={saved === "addresses"}>שמירת הכתובות</SubmitButton>
              </div>
            </form>
          </details>
        )}
      </div>

      {error && !editing && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{ERRORS[error] ?? "שגיאה"}</p>}

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-start text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="w-16 px-3 py-2 text-start font-medium">פעיל</th>
              <th scope="col" className="px-3 py-2 text-start font-medium">הודעה</th>
              <th scope="col" className="hidden px-3 py-2 text-start font-medium md:table-cell">מתי</th>
              <th scope="col" className="hidden px-3 py-2 text-start font-medium lg:table-cell">למי</th>
              <th scope="col" className="hidden px-3 py-2 text-start font-medium md:table-cell">מצב</th>
              <th scope="col" className="w-24 px-3 py-2 text-start font-medium"><span className="sr-only">פעולות</span></th>
            </tr>
          </thead>
          <tbody>
            {TRIGGERS.map((def) => {
              const eff = effectiveTrigger(def.key, settings, orgId);
              const text = effectiveTemplate(def.key, templates, orgId);
              const c: Counts = counts[def.key] ?? { sent: 0, failed: 0, queued: 0 };
              return (
                <tr key={def.key} data-trigger={def.key} className={cn("border-t align-top", edit === def.key && "bg-primary/5")}>
                  <td className="px-3 py-2">
                    <TriggerToggle key={`${def.key}-${eff.enabled}`} triggerKey={def.key} org={orgId ?? ""} enabled={eff.enabled} label={def.label} locked={def.locked} />
                  </td>
                  <td className="max-w-0 px-3 py-2">
                    <p className="font-semibold">{def.label}</p>
                    <p className="truncate text-muted-foreground" title={text.subject}>{text.subject}</p>
                  </td>
                  <td className="hidden px-3 py-2 md:table-cell">
                    <Badge tone={def.periodic ? "warning" : "default"}>{def.periodic ? "מתוזמן" : "אירוע"}</Badge>
                    <p className="mt-1 text-muted-foreground">{def.periodic && eff.schedule ? describeSchedule(eff.schedule) : def.when}</p>
                  </td>
                  <td className="hidden px-3 py-2 text-muted-foreground lg:table-cell">{recipientsText(def, eff)}</td>
                  <td className="hidden px-3 py-2 md:table-cell">
                    <Link href={`/admin/mail?kind=${def.key}`} className="whitespace-nowrap underline-offset-4 hover:underline">
                      {c.sent} נשלחו{c.queued ? ` · ${c.queued} בתור` : ""}{c.failed ? ` · ${c.failed} נכשלו` : ""}
                    </Link>
                    {(eff.source !== "default" || text.source !== "default") && (
                      <p className="mt-1"><Badge tone="muted">{SOURCE[eff.source !== "default" ? eff.source : text.source]}</Badge></p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-end">
                    {!def.locked && (
                      <Link href={editHref(def.key)} scroll={false} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label={`עריכה – ${def.label}`}>
                        עריכה
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">מונים: 30 הימים האחרונים. קוד אימות נשלח תמיד ואי אפשר לשנות אותו.</p>

      {editing && !editing.locked && (
        <EditPanel def={editing} orgId={orgId} orgName={org?.name ?? null} eff={effectiveTrigger(editing.key, settings, orgId)} text={effectiveTemplate(editing.key, templates, orgId)} closeHref={listHref} saved={saved} error={errorKey === editing.key ? error : undefined} />
      )}
    </main>
  );
}

function EditPanel({ def, orgId, orgName, eff, text, closeHref, saved, error }: {
  def: TriggerDef;
  orgId: string | null;
  orgName: string | null;
  eff: EffectiveTrigger;
  text: ReturnType<typeof effectiveTemplate>;
  closeHref: string;
  saved?: string;
  error?: string;
}) {
  const hidden = (
    <>
      <input type="hidden" name="org" value={orgId ?? ""} />
      <input type="hidden" name="key" value={def.key} />
      <input type="hidden" name="edit" value="1" />
    </>
  );
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/30" role="dialog" aria-modal="true" aria-labelledby="edit-title">
      <Link href={closeHref} scroll={false} className="absolute inset-0" aria-label="סגירה" tabIndex={-1} />
      <div className="relative h-full w-full max-w-4xl overflow-y-auto bg-background shadow-xl">
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b bg-background px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id="edit-title" className="text-lg font-semibold">{def.label}</h2>
            <p className="text-sm text-muted-foreground">{def.when} · {orgName ? `הגדרה ל${orgName}` : "הגדרה לכל העמותות"}</p>
          </div>
          <Link href={closeHref} scroll={false} className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="סגירה">
            <X className="size-5" aria-hidden />
          </Link>
        </div>

        <div className="space-y-6 p-4">
          <section aria-labelledby="who-h" className="space-y-3">
            <h3 id="who-h" className="font-semibold">מי מקבל{def.periodic ? " ומתי" : ""} <Badge tone="muted">{SOURCE[eff.source]}</Badge></h3>
            <form action={saveTriggerAction} className="space-y-3">
              {hidden}
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
              {def.periodic && eff.schedule && (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">מתי לשלוח (שעון ישראל)</legend>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <Radio name="scheduleKind" value="weekdays" defaultChecked={eff.schedule.kind === "weekdays"} /> בימים בשבוע:
                    </label>
                    {WEEKDAY_NAMES.map((d, i) => (
                      <label key={d} className="flex min-h-11 items-center gap-1 text-sm">
                        <Checkbox name="weekday" value={i} defaultChecked={eff.schedule!.kind === "weekdays" && eff.schedule!.days.includes(i)} aria-label={`יום ${d}`} />
                        {d}
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <Radio name="scheduleKind" value="monthDays" defaultChecked={eff.schedule.kind === "monthDays"} /> בימים בחודש:
                    </label>
                    <Input name="monthDays" aria-label="ימים בחודש" placeholder="2, 11, 14, 19" dir="ltr" className="max-w-48" defaultValue={eff.schedule.kind === "monthDays" ? eff.schedule.days.join(", ") : ""} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`hour-${def.key}`}>בשעה</Label>
                    <Select id={`hour-${def.key}`} name="hour" defaultValue={String(eff.schedule.hour)} className="max-w-28" dir="ltr">
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>
                      ))}
                    </Select>
                  </div>
                </fieldset>
              )}
              {error && !error.startsWith("text_") && <p role="alert" className="text-sm text-destructive">{ERRORS[error] ?? "שגיאה"}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <SubmitButton name="do" value="save" saved={saved === def.key}>שמירה</SubmitButton>
                {def.periodic && orgId && (
                  <SubmitButton variant="outline" formAction={sendSummaryNowAction} formNoValidate name="do" value="now" saved={saved === "now"} savedText="נשלח">
                    שליחה עכשיו
                  </SubmitButton>
                )}
                {eff.source === (orgId ? "org" : "all") && (
                  <SubmitButton variant="outline" formAction={resetTriggerAction} name="do" value="reset">
                    {orgId ? "חזרה להגדרה הכללית" : "חזרה לברירת המחדל"}
                  </SubmitButton>
                )}
              </div>
            </form>
          </section>

          <section aria-labelledby="text-h" className="space-y-3 border-t pt-4">
            <h3 id="text-h" className="font-semibold">עיצוב ונוסח המייל <Badge tone="muted">{SOURCE[text.source]}</Badge></h3>
            <form action={saveTemplateAction} className="space-y-3">
              {hidden}
              <TemplateEditor key={`${text.source}-${text.subject}-${text.html ?? text.body}`} id={`tx-${def.key}`} subject={text.subject} html={text.html ?? text.body} vars={def.vars} />
              {error?.startsWith("text_") && <p role="alert" className="text-sm text-destructive">{ERRORS[error] ?? "שגיאה"}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <SubmitButton name="do" value="save" saved={saved === `text-${def.key}`}>שמירת העיצוב</SubmitButton>
                {text.source === (orgId ? "org" : "all") && (
                  <SubmitButton variant="outline" formAction={resetTemplateAction} formNoValidate name="do" value="reset">
                    {orgId ? "חזרה לעיצוב הכללי" : "חזרה לעיצוב ברירת המחדל"}
                  </SubmitButton>
                )}
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
