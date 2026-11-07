import Link from "next/link";
import { Badge, Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateWorkflow } from "@/lib/workflow/validate-workflow";
import { listOrgs } from "@/server/orgs-store";
import { availableForms, getPackage } from "@/server/packages-store";
import { archivePackageAction, documentAction, savePackageAction, savePackageSettingsAction } from "@/app/admin/packages/actions";
import { getWizardPackage } from "@/server/packages-store";
import { getEditorData } from "@/server/forms-store";
import { answerFields, fieldRole } from "@/lib/workflow/step-fields";
import { fillsIn } from "@/lib/forms/schema";
import { normalizeExpiryRule } from "@/lib/requests/expiry";
import { ExpiryRuleField } from "./ExpiryRuleBuilder";
import { normalizeFollowUpStatuses } from "@/lib/requests/follow-up";
import { formatRecipients } from "@/lib/requests/recipients";


export type FlowQuery = { saved?: string; error?: string; stepError?: string; settingsError?: string };

/**
 * The signing route and sending settings. `formId` = shown inside a form ("שלבי הטופס"): the package is the form's
 * own, so its name follows the form and there is no list of forms or archive button; every save comes back here.
 */
export async function FlowSettings({ id, query, formId, settingsOnly = false }: { id: string; query: FlowQuery; formId?: string; settingsOnly?: boolean }) {
  const { saved, error, stepError, settingsError } = query;
  const data = await getPackage(id);
  if (!data) return null;
  const returnTo = formId ? <input type="hidden" name="returnTo" value={`/admin/forms/${formId}/flow`} /> : null;
  const { pkg, items } = data;
  const [orgs, forms] = await Promise.all([listOrgs(), availableForms()]);
  const inPackage = new Set(items.map((i) => i.templateId));
  const addable = forms.filter((f) => !inPackage.has(f.id));
  const problems = validateWorkflow(pkg.workflow);
  const unpublishedRequired = items.filter((i) => i.required && !i.publishedVersion);
  // Date fields the sender fills (the request's deadline is set when it is sent), from the form as being edited.
  const editing = formId ? await getEditorData(formId) : null;
  const wizard = editing ? null : await getWizardPackage(id);
  const def = editing?.version.definition ?? wizard?.requesterDefinition;
  const dateFields = def ? answerFields(def).filter((f) => f.type === "date" && fillsIn(f, "requester")).map((f) => {
    const at = pkg.workflow.steps.findIndex((s) => s.role === fieldRole(f));
    return { id: f.id, label: f.label || f.id, hint: at >= 0 ? `שלב ${at + 1}` : undefined };
  }) : [];
  const rule = normalizeExpiryRule(pkg.expiryRule);
  const followUps = normalizeFollowUpStatuses(pkg.followUpStatuses);

  const orgCard = (
      <Card className="p-4">
        <form action={savePackageAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={pkg.id} />
          {returnTo}
          {formId ? (
            <input type="hidden" name="name" value={pkg.name} />
          ) : (
            <div className="space-y-1">
              <Label htmlFor="pk-name">שם הערכה</Label>
              <Input id="pk-name" name="name" defaultValue={pkg.name} required />
            </div>
          )}
          <fieldset className="space-y-1 sm:col-span-2">
            <legend className="text-sm font-medium">{formId ? "הטופס זמין לעמותות" : "זמינה לעמותות"}</legend>
            <input type="hidden" name="orgsField" value="1" />
            <div className="flex flex-wrap gap-x-4">
              {orgs.map((o) => (
                <label key={o.id} className="flex min-h-10 items-center gap-2 text-sm">
                  <Checkbox name="organizationIds" value={o.id} defaultChecked={(pkg.organizationIds?.length ? pkg.organizationIds : pkg.organizationId ? [pkg.organizationId] : []).includes(o.id)} />
                  {o.name}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">בלי סימון – לכל העמותות. לכל עמותה מסומנת יש קישור משלה למילוי; כשהטופס פתוח ליותר מעמותה אחת, הקישור הכללי (בלי עמותה) לא נפתח.</p>
          </fieldset>
          {!formId && (
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="pk-desc">תיאור</Label>
              <Textarea id="pk-desc" name="description" defaultValue={pkg.description ?? ""} rows={2} />
            </div>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <SubmitButton saved={saved === "org"}>שמירה</SubmitButton>
          </div>
        </form>
      </Card>
  );

  return (
    <div className="space-y-6">
      {!formId && (
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/admin/packages" className="text-sm text-muted-foreground hover:text-foreground">→ כל הערכות</Link>
          <h1 className="text-2xl font-bold">{pkg.name}</h1>
          {pkg.archivedAt && <Badge tone="muted">בארכיון</Badge>}
        </div>
      )}
      {saved === "1" && <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success">נשמר</p>}
      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">יש להזין שם לערכה</p>}
      {stepError && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">השלב לא נשמר: {stepError}</p>}
      {!settingsOnly && (problems.length > 0 || items.length === 0 || unpublishedRequired.length > 0) && (
        <Card className="space-y-1 border-warning p-4 text-sm" role="status">
          <p className="font-medium">{formId ? "עדיין אי אפשר לשלוח את הטופס:" : "לא ניתן עדיין ליצור בקשות מהערכה הזאת:"}</p>
          <ul className="list-inside list-disc text-muted-foreground">
            {items.length === 0 && <li>הוסיפו לפחות טופס אחד</li>}
            {unpublishedRequired.map((i) => <li key={i.id}>{formId ? "הטופס עדיין לא פורסם" : <>הטופס &quot;{i.title}&quot; עדיין לא פורסם</>}</li>)}
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </Card>
      )}

      {!formId && orgCard}

      {!formId && <section className="space-y-2" aria-labelledby="docs-h">
        <h2 id="docs-h" className="text-lg font-semibold">טפסים בערכה</h2>
        <Card className="divide-y">
          {items.length === 0 && <p className="p-4 text-sm text-muted-foreground">אין טפסים בערכה.</p>}
          {items.map((it, i) => (
            <form key={it.id} action={documentAction} className="flex flex-wrap items-center gap-2 p-3">
              <input type="hidden" name="id" value={pkg.id} />
              <input type="hidden" name="itemId" value={it.id} />
              <span className="w-6 text-sm text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 font-medium">{it.title}</span>
              {it.publishedVersion ? <Badge tone="success">גרסה {it.publishedVersion}</Badge> : <Badge tone="warning">לא פורסם</Badge>}
              <SubmitButton name="intent" value={it.required ? "optional" : "required"} variant="outline" size="sm">{it.required ? "חובה" : "רשות"}</SubmitButton>
              <SubmitButton name="intent" value="up" variant="ghost" size="sm" disabled={i === 0} aria-label="העלאה">↑</SubmitButton>
              <SubmitButton name="intent" value="down" variant="ghost" size="sm" disabled={i === items.length - 1} aria-label="הורדה">↓</SubmitButton>
              <SubmitButton name="intent" value="remove" variant="ghost" size="sm">הסרה</SubmitButton>
            </form>
          ))}
          {addable.length > 0 && (
            <form action={documentAction} className="flex flex-wrap items-center gap-2 p-3">
              <input type="hidden" name="id" value={pkg.id} />
              <Select name="templateId" aria-label="טופס להוספה" className="max-w-xs">
                {addable.map((f) => <option key={f.id} value={f.id}>{f.title}{f.publishedVersion ? "" : " (לא פורסם)"}</option>)}
              </Select>
              <SubmitButton name="intent" value="add" variant="outline">הוספת טופס</SubmitButton>
            </form>
          )}
        </Card>
      </section>}


      {!formId && <form action={archivePackageAction} className="border-t pt-4">
        <input type="hidden" name="id" value={pkg.id} />
        <input type="hidden" name="archive" value={pkg.archivedAt ? "0" : "1"} />
        <SubmitButton variant="ghost" className="text-destructive">{pkg.archivedAt ? "שחזור מהארכיון" : "העברה לארכיון"}</SubmitButton>
      </form>}
      <section className="space-y-2" aria-labelledby="settings-h">
        <h2 id="settings-h" className="text-lg font-semibold">{formId ? "הגדרות שליחה" : "הגדרות התהליך"}</h2>
        {settingsError && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {settingsError === "expiry" ? "כלל התוקף לא שלם (למשל לא נבחר שדה תאריך)" : `כתובות לא תקינות: ${settingsError}`}
          </p>
        )}
        <Card className="p-0">
          <form action={savePackageSettingsAction} className="divide-y">
            <input type="hidden" name="id" value={pkg.id} />
            {returnTo}
            <fieldset className="grid gap-4 p-4 sm:grid-cols-2">
              <legend className="sr-only">מיילים</legend>
              <div className="space-y-1">
                <Label htmlFor="pk-recipients">מקבלי המסמכים החתומים בסיום</Label>
                <Textarea id="pk-recipients" name="recipients" dir="ltr" rows={3} defaultValue={formatRecipients(pkg.completionRecipients)} placeholder={"חשבות שכר <payroll@misrad.org.il>\nhr@misrad.org.il"} />
                <p className="text-xs text-muted-foreground">
                  שורה לכל נמען. מקבלים את קובצי ה-PDF החתומים, בנוסף לעובד ולמי שפתח את הבקשה.
                  {formId && <> אותן כתובות מופיעות גם ב<Link href={`/admin/forms/${formId}?tab=process`} className="underline">עיבוד טופס</Link>.</>}
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="pk-mail-note">הערה במיילים של הטופס</Label>
                <Textarea id="pk-mail-note" name="mailNote" rows={3} maxLength={500} defaultValue={pkg.mailNote ?? ""} placeholder="לא ניתן להתחיל עבודה בפועל ללא חתימה על הטפסים." />
                <p className="text-xs text-muted-foreground">מופיעה במייל במקום {"{{note}}"} (הנוסח במרכז המיילים ← טריגרים).</p>
              </div>
            </fieldset>
            <fieldset className="space-y-3 p-4">
              <legend className="sr-only">תוקף ותזכורות</legend>
              <ExpiryRuleField name="expiryRule" initial={rule} dateFields={dateFields} inherit="ברירת מחדל: 30 ימים מהשליחה" />
              <p className="text-xs text-muted-foreground">
                חל על כל השלבים, חוץ משלב שקיבל תוקף משלו בטבלת השלבים. כאן רק תאריכים שהשולח ממלא; לפי תאריך של שלב מאוחר – בתוקף של השלב עצמו. אפשר להאריך כל בקשה בנפרד.
                {dateFields.length === 0 && " אין בטופס שדה תאריך שהשולח ממלא."}
              </p>
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <Checkbox name="remindersEnabled" defaultChecked={pkg.remindersEnabled} />
                לשלוח תזכורות אוטומטיות עד שהשלב מסתיים
              </label>
            </fieldset>
            <fieldset className="space-y-1 p-4">
              <legend className="sr-only">אחרי החתימה</legend>
              <Label htmlFor="pk-followup">טיפול אחרי החתימה</Label>
              <Textarea id="pk-followup" name="followUp" rows={2} defaultValue={followUps.map((f) => f.label).join("\n")} placeholder={"עודכן בשכר\nהוקם בפריוריטי"} />
              <p className="text-xs text-muted-foreground">שורה לכל שלב. הצוות מסמן אותם בבקשה אחרי שכולם חתמו.</p>
            </fieldset>
            <div className="p-4">
              <SubmitButton saved={saved === "settings"}>שמירת ההגדרות</SubmitButton>
            </div>
          </form>
        </Card>
      </section>
      {formId && orgCard}
    </div>
  );
}
