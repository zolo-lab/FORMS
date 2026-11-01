import Link from "next/link";
import { Trash2, X } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { buttonVariants } from "@/components/ui/button";
import { OrgTheme } from "@/components/branding";
import { normalizeHex } from "@/lib/branding";
import { DEFAULT_REMINDER_POLICY } from "@/lib/workflow/types";
import { listOrgs, listProjects, projectUsage } from "@/server/orgs-store";
import { ORG_ERRORS } from "@/lib/orgs/input";
import { createOrgAction, createProjectAction, deleteProjectAction, updateOrgAction, updateOrgBasicsAction, updateProjectAction } from "./actions";
import { OrgsTable } from "./OrgsTable";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  ...ORG_ERRORS,
  color: "צבע לא תקין (פורמט #RRGGBB)",
  email: "כתובת שולח לא תקינה",
  logo: "הלוגו חייב להיות PNG / JPG / WEBP עד 1MB",
};

const PATH = "/admin/settings/organizations";

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

/** Organizations as a table; adding and editing (details, projects, branding, reminders) in a side panel. */
export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; edit?: string; n?: string }> }) {
  const { error, saved, edit, n } = await searchParams;
  const [orgs, projects, usage] = await Promise.all([listOrgs(), listProjects(), projectUsage()]);
  const rows = orgs.map((o) => ({
    id: o.id,
    name: o.name,
    registrationNumber: o.registrationNumber,
    slug: o.slug,
    active: o.active,
    projects: projects.filter((p) => p.organizationId === o.id).map((p) => ({ name: p.name, active: p.active })),
  }));
  const editing = orgs.find((o) => o.id === edit);
  const errorText = error === "projectInUse" ? `אי אפשר למחוק: ${n ?? "כמה"} בקשות ועובדים משויכים לפרויקט. אפשר להשבית אותו במקום.` : error ? (ERRORS[error] ?? "שגיאה") : null;

  return (
    <main className="space-y-4 px-4 py-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="עמותות ועסקים" description="לכל עמותה ח״פ, קיצור לקישורים, ופרויקטים בתוכה (למשל ארצנו ות״ת תחת שיבת ציון). במסך המשתמשים אפשר להגביל מנהל לחלק מהעמותות או מהפרויקטים." />
        <Link href={`${PATH}?edit=new`} scroll={false} className={buttonVariants({})}>הוספת עמותה</Link>
      </div>
      {errorText && !edit && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{errorText}</p>}
      {saved === "bulk" && <p role="status" className="text-sm text-success">נשמר.</p>}

      <OrgsTable rows={rows} editing={edit} />

      {edit === "new" && (
        <Panel title="עמותה חדשה" closeHref={PATH}>
          {errorText && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{errorText}</p>}
          <form action={createOrgAction} className="grid gap-3 sm:grid-cols-2">
            <Field label="שם העמותה / העסק" htmlFor="new-name"><Input id="new-name" name="name" required maxLength={120} /></Field>
            <Field label='ח"פ / מספר עמותה' htmlFor="new-reg"><Input id="new-reg" name="registrationNumber" required inputMode="numeric" dir="ltr" placeholder="580000000" /></Field>
            <div className="sm:col-span-2"><SubmitButton>הוספה</SubmitButton></div>
          </form>
        </Panel>
      )}

      {editing && (() => {
        const o = editing;
        const mine = projects.filter((p) => p.organizationId === o.id);
        const rp = o.reminderPolicy ?? DEFAULT_REMINDER_POLICY;
        return (
          <Panel title={o.name} subtitle={o.slug ? `קיצור בקישור: ${o.slug}` : undefined} closeHref={PATH}>
            {errorText && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{errorText}</p>}

            <section aria-labelledby="sec-details" className="space-y-3">
              <h3 id="sec-details" className="font-semibold">פרטים</h3>
              <form action={updateOrgBasicsAction} className="grid gap-3 sm:grid-cols-[2fr_1fr] sm:items-end">
                <input type="hidden" name="id" value={o.id} />
                <Field label="שם העמותה / העסק" htmlFor="o-name"><Input id="o-name" name="name" defaultValue={o.name} required maxLength={120} /></Field>
                <Field label='ח"פ' htmlFor="o-reg"><Input id="o-reg" name="registrationNumber" defaultValue={o.registrationNumber} required inputMode="numeric" dir="ltr" /></Field>
                <label className="flex min-h-11 items-center gap-2 text-sm"><Checkbox name="active" defaultChecked={o.active} /> פעילה</label>
                <div><SubmitButton saved={saved === `org-${o.id}` || saved === "new"}>שמירה</SubmitButton></div>
              </form>
            </section>

            <section aria-labelledby="sec-projects" className="space-y-3 border-t pt-4">
              <div>
                <h3 id="sec-projects" className="font-semibold">פרויקטים</h3>
                <p className="text-sm text-muted-foreground">יחידות בתוך העמותה. בקשה ועובד משויכים לפרויקט; לפי הפרויקט מסננים בדשבורד ובייצוא, ואפשר להגביל מנהל לפרויקטים מסוימים.</p>
              </div>
              {mine.length > 0 && (
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-3 py-2 text-start font-medium">שם</th>
                        <th scope="col" className="w-20 px-3 py-2 text-start font-medium">פעיל</th>
                        <th scope="col" className="w-16 px-3 py-2 text-start font-medium">בשימוש</th>
                        <th scope="col" className="w-40 px-3 py-2"><span className="sr-only">פעולות</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {mine.map((p) => (
                        <tr key={p.id} className="border-t">
                          <td className="px-3 py-1.5">
                            <Input form={`proj-${p.id}`} name="name" defaultValue={p.name} required maxLength={120} aria-label={`שם הפרויקט – ${p.name}`} className="h-9" />
                          </td>
                          <td className="px-3 py-1.5"><Checkbox form={`proj-${p.id}`} name="active" defaultChecked={p.active} aria-label={`פרויקט פעיל – ${p.name}`} /></td>
                          <td className="px-3 py-1.5 text-muted-foreground">{usage.get(p.id) ?? 0}</td>
                          <td className="px-3 py-1.5">
                            <span className="flex items-center justify-end gap-1">
                              <form id={`proj-${p.id}`} action={updateProjectAction}>
                                <input type="hidden" name="id" value={p.id} />
                                <input type="hidden" name="org" value={o.id} />
                                <SubmitButton size="sm" variant="outline" saved={saved === `proj-${p.id}`}>שמירה</SubmitButton>
                              </form>
                              <form action={deleteProjectAction}>
                                <input type="hidden" name="id" value={p.id} />
                                <input type="hidden" name="org" value={o.id} />
                                <SubmitButton size="icon" variant="ghost" className="text-destructive" aria-label={`מחיקת הפרויקט ${p.name}`} title={usage.get(p.id) ? "בשימוש – אפשר להשבית" : "מחיקה"}>
                                  <Trash2 className="size-4" aria-hidden />
                                </SubmitButton>
                              </form>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {saved === "projdel" && <p role="status" className="text-sm text-success">הפרויקט נמחק.</p>}
              <form action={createProjectAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="organizationId" value={o.id} />
                <Field label="פרויקט חדש" htmlFor="new-proj"><Input id="new-proj" name="name" required maxLength={120} placeholder="למשל: ארצנו" className="min-w-56" /></Field>
                <SubmitButton variant="outline" saved={saved === `newproj-${o.id}`} savedText="נוסף">הוספה</SubmitButton>
              </form>
            </section>

            <section aria-labelledby="sec-brand" className="space-y-3 border-t pt-4">
              <h3 id="sec-brand" className="font-semibold">מיתוג, שולח ותזכורות</h3>
              <OrgTheme org={o}>
                <form action={updateOrgAction} className="space-y-4">
                  <input type="hidden" name="id" value={o.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="צבע ראשי" htmlFor="o-color"><Input id="o-color" name="primaryColor" defaultValue={normalizeHex(o.primaryColor) ?? ""} placeholder="#1d4ed8" dir="ltr" /></Field>
                    <Field label="שם השולח במיילים" htmlFor="o-sname"><Input id="o-sname" name="senderName" defaultValue={o.senderName ?? ""} /></Field>
                    <Field label="כתובת שולח" htmlFor="o-semail"><Input id="o-semail" name="senderEmail" type="email" defaultValue={o.senderEmail ?? ""} dir="ltr" /></Field>
                    <Field label="לוגו (PNG / JPG, עד 1MB)" htmlFor="o-logo"><Input id="o-logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="h-auto py-2" /></Field>
                    {o.logoFileId && (
                      <label className="flex items-center gap-2 text-sm"><Checkbox name="removeLogo" value="1" /> הסרת הלוגו הקיים</label>
                    )}
                  </div>
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">מדיניות תזכורות</legend>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="תזכורת ראשונה אחרי (שעות)" htmlFor="o-first"><Input id="o-first" name="firstAfterHours" type="number" inputMode="numeric" min={1} defaultValue={rp.firstAfterHours} /></Field>
                      <Field label="כל (שעות)" htmlFor="o-every"><Input id="o-every" name="everyHours" type="number" inputMode="numeric" min={1} defaultValue={rp.everyHours} /></Field>
                      <Field label="מקסימום (0 = עד שחותמים)" htmlFor="o-max"><Input id="o-max" name="maxCount" type="number" inputMode="numeric" min={0} max={10} defaultValue={rp.maxCount} /></Field>
                      <Field label="לא לשלוח מהשעה" htmlFor="o-qf"><Input id="o-qf" name="quietFromHour" type="number" inputMode="numeric" min={0} max={23} defaultValue={rp.quietFromHour} /></Field>
                      <Field label="עד השעה" htmlFor="o-qt"><Input id="o-qt" name="quietToHour" type="number" inputMode="numeric" min={0} max={23} defaultValue={rp.quietToHour} /></Field>
                      <label className="flex items-center gap-2 self-end pb-2 text-sm"><Checkbox name="skipShabbat" defaultChecked={rp.skipShabbat} /> לא לשלוח בשבת</label>
                    </div>
                  </fieldset>
                  <SubmitButton saved={saved === `brand-${o.id}`}>שמירה</SubmitButton>
                </form>
              </OrgTheme>
            </section>
          </Panel>
        );
      })()}
    </main>
  );
}

/** Side panel (half the page on a computer, the whole screen on a phone); closing goes back to the table. */
function Panel({ title, subtitle, closeHref, children }: { title: string; subtitle?: string; closeHref: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/30" role="dialog" aria-modal="true" aria-labelledby="panel-title">
      <Link href={closeHref} scroll={false} className="absolute inset-0" aria-label="סגירה" tabIndex={-1} />
      <div className="relative h-full w-full overflow-y-auto bg-background shadow-xl md:w-1/2 md:min-w-[36rem]">
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b bg-background px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id="panel-title" className="text-lg font-semibold">{title}</h2>
            {subtitle && <p className="text-sm text-muted-foreground"><bdi dir="ltr">{subtitle}</bdi></p>}
          </div>
          <Link href={closeHref} scroll={false} className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="סגירה"><X className="size-5" aria-hidden /></Link>
        </div>
        <div className="space-y-6 p-4">{children}</div>
      </div>
    </div>
  );
}

