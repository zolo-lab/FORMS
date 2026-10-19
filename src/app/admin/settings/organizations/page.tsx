import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { OrgTheme } from "@/components/branding";
import { normalizeHex } from "@/lib/branding";
import { DEFAULT_REMINDER_POLICY } from "@/lib/workflow/types";
import { listOrgs, listProjects } from "@/server/orgs-store";
import { ORG_ERRORS } from "@/lib/orgs/input";
import { createOrgAction, createProjectAction, updateOrgAction, updateOrgBasicsAction, updateProjectAction } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  ...ORG_ERRORS,
  color: "צבע לא תקין (פורמט #RRGGBB)",
  email: "כתובת שולח לא תקינה",
  logo: "הלוגו חייב להיות PNG / JPG / WEBP עד 1MB",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { error, saved } = await searchParams;
  const [orgs, projects] = await Promise.all([listOrgs(), listProjects()]);
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">עמותות ועסקים</h1>
        <p className="text-sm text-muted-foreground">לכל עמותה או עסק שם וח&quot;פ אחד, ומתחתיה הפרויקטים שלה, כל אחד בשם משלו. במסך המשתמשים אפשר להגביל מנהל לחלק מהעמותות.</p>
      </header>
      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{ERRORS[error] ?? "שגיאה"}</p>}
      {saved && <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success">נשמר</p>}

      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">הוספת עמותה / עסק</h2>
        <form action={createOrgAction} className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <Field label="שם העמותה / העסק">
            <Input name="name" required maxLength={120} />
          </Field>
          <Field label='ח"פ / מספר עמותה'>
            <Input name="registrationNumber" required inputMode="numeric" dir="ltr" placeholder="580000000" />
          </Field>
          <Button type="submit">הוספה</Button>
        </form>
      </Card>

      <div className="space-y-3">
        {orgs.length === 0 && <Card className="p-4 text-sm text-muted-foreground">אין עדיין עמותות או עסקים.</Card>}
        {orgs.map((o) => {
          const mine = projects.filter((p) => p.organizationId === o.id);
          return (
            <Card key={o.id} className={`space-y-3 p-3 ${o.active ? "" : "opacity-60"}`}>
              <form action={updateOrgBasicsAction} className="grid gap-2 text-sm sm:items-end sm:grid-cols-[2fr_1fr_auto_auto]">
                <input type="hidden" name="id" value={o.id} />
                <Field label="שם העמותה / העסק">
                  <Input name="name" defaultValue={o.name} required maxLength={120} />
                </Field>
                <Field label='ח"פ'>
                  <Input name="registrationNumber" defaultValue={o.registrationNumber} required inputMode="numeric" dir="ltr" />
                </Field>
                <label className="flex items-center gap-2 pb-2">
                  <Checkbox name="active" defaultChecked={o.active} aria-label={`פעיל – ${o.name}`} /> פעיל
                </label>
                <Button type="submit" variant="outline" size="sm">שמירה</Button>
              </form>

              <div className="space-y-2 border-s-2 ps-3">
                <p className="text-sm font-medium">פרויקטים</p>
                {mine.length === 0 && <p className="text-sm text-muted-foreground">אין פרויקטים.</p>}
                {mine.map((p) => (
                  <form key={p.id} action={updateProjectAction} className={`flex flex-wrap items-center gap-2 text-sm ${p.active ? "" : "opacity-60"}`}>
                    <input type="hidden" name="id" value={p.id} />
                    <Input name="name" defaultValue={p.name} required maxLength={120} className="max-w-xs" aria-label={`שם הפרויקט – ${p.name}`} />
                    <label className="flex items-center gap-2">
                      <Checkbox name="active" defaultChecked={p.active} aria-label={`פרויקט פעיל – ${p.name}`} /> פעיל
                    </label>
                    <Button type="submit" variant="outline" size="sm">שמירה</Button>
                  </form>
                ))}
                <form action={createProjectAction} className="flex flex-wrap items-center gap-2 text-sm">
                  <input type="hidden" name="organizationId" value={o.id} />
                  <Input name="name" required maxLength={120} placeholder="שם פרויקט חדש" className="max-w-xs" aria-label={`פרויקט חדש – ${o.name}`} />
                  <Button type="submit" size="sm">הוספת פרויקט</Button>
                </form>
              </div>
            </Card>
          );
        })}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">מיתוג, שולח ותזכורות</h2>
      {orgs.map((o) => {
        const rp = o.reminderPolicy ?? DEFAULT_REMINDER_POLICY;
        return (
          <details key={o.id} className="rounded-lg border bg-card">
            <summary className="cursor-pointer px-4 py-3 font-medium">{o.name}</summary>
            <div className="space-y-4 p-4 pt-0">
            <OrgTheme org={o}>
              <form action={updateOrgAction} className="space-y-4">
                <input type="hidden" name="id" value={o.id} />
                <p className="text-sm text-muted-foreground" dir="ltr">
                  {o.slug} · {o.registrationNumber}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="צבע ראשי">
                    <div className="flex gap-2">
                      <Input name="primaryColor" defaultValue={normalizeHex(o.primaryColor) ?? ""} placeholder="#1d4ed8" dir="ltr" />
                    </div>
                  </Field>
                  <Field label="שם השולח במיילים">
                    <Input name="senderName" defaultValue={o.senderName ?? ""} />
                  </Field>
                  <Field label="כתובת שולח">
                    <Input name="senderEmail" type="email" defaultValue={o.senderEmail ?? ""} dir="ltr" />
                  </Field>
                  <Field label="לוגו (PNG / JPG, עד 1MB)">
                    <Input name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="h-auto py-2" />
                  </Field>
                  {o.logoFileId && (
                    <label className="flex items-center gap-2 self-end pb-2 text-sm">
                      <Checkbox name="removeLogo" value="1" /> הסרת הלוגו הקיים
                    </label>
                  )}
                </div>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">מדיניות תזכורות</legend>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="תזכורת ראשונה אחרי (שעות)">
                      <Input name="firstAfterHours" type="number" inputMode="numeric" min={1} defaultValue={rp.firstAfterHours} />
                    </Field>
                    <Field label="כל (שעות)">
                      <Input name="everyHours" type="number" inputMode="numeric" min={1} defaultValue={rp.everyHours} />
                    </Field>
                    <Field label="מקסימום תזכורות (0 = עד שחותמים)">
                      <Input name="maxCount" type="number" inputMode="numeric" min={0} max={10} defaultValue={rp.maxCount} />
                    </Field>
                    <Field label="לא לשלוח מהשעה">
                      <Input name="quietFromHour" type="number" inputMode="numeric" min={0} max={23} defaultValue={rp.quietFromHour} />
                    </Field>
                    <Field label="עד השעה">
                      <Input name="quietToHour" type="number" inputMode="numeric" min={0} max={23} defaultValue={rp.quietToHour} />
                    </Field>
                    <label className="flex items-center gap-2 self-end pb-2 text-sm">
                      <Checkbox name="skipShabbat" defaultChecked={rp.skipShabbat} /> לא לשלוח בשבת
                    </label>
                  </div>
                </fieldset>
                <Button type="submit">שמירה</Button>
              </form>
            </OrgTheme>
            </div>
          </details>
        );
      })}
      </section>
    </main>
  );
}
