import Link from "next/link";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StepsEditor } from "./StepsEditor";
import { draftOf } from "@/lib/workflow/step-who";
import { groupIdOfSource } from "@/lib/workflow/assignee";
import { listContacts, listGroups } from "@/server/people-store";
import { validateWorkflow } from "@/lib/workflow/validate-workflow";
import { listOrgs } from "@/server/orgs-store";
import { availableForms, getPackage } from "@/server/packages-store";
import { archivePackageAction, documentAction, savePackageAction, savePackageSettingsAction, saveStepsAction } from "@/app/admin/packages/actions";
import { getWizardPackage } from "@/server/packages-store";
import { allFields, type FormDefinition } from "@/lib/forms/schema";
import { getEditorData } from "@/server/forms-store";
import { describeExpiryRule, normalizeExpiryRule } from "@/lib/requests/expiry";
import { normalizeFollowUpStatuses } from "@/lib/requests/follow-up";
import { formatRecipients } from "@/lib/requests/recipients";


export type FlowQuery = { saved?: string; error?: string; stepError?: string; settingsError?: string };

/**
 * The signing route and sending settings. `formId` = shown inside a form ("שלבי הטופס"): the package is the form's
 * own, so its name follows the form and there is no list of forms or archive button; every save comes back here.
 */
export async function FlowSettings({ id, query, formId }: { id: string; query: FlowQuery; formId?: string }) {
  const { saved, error, stepError, settingsError } = query;
  const data = await getPackage(id);
  if (!data) return null;
  const returnTo = formId ? <input type="hidden" name="returnTo" value={`/admin/forms/${formId}/flow`} /> : null;
  const [contacts, groups] = await Promise.all([listContacts(), listGroups()]);
  const { pkg, items } = data;
  const [orgs, forms] = await Promise.all([listOrgs(), availableForms()]);
  const inPackage = new Set(items.map((i) => i.templateId));
  const addable = forms.filter((f) => !inPackage.has(f.id));
  const problems = validateWorkflow(pkg.workflow);
  const unpublishedRequired = items.filter((i) => i.required && !i.publishedVersion);
  // Date fields the requester fills: the "Nth of the next month" expiry counts from one of them.
  const wizard = await getWizardPackage(id);
  // A step "by a field" goes to the e-mail typed in it, or to the group member picked in a group list: only those fit.
  const editors = await Promise.all(items.map((i) => getEditorData(i.templateId)));
  const emailFields = editors.flatMap((e) => (e?.version ? allFields(e.version.definition as FormDefinition) : []))
    .filter((f) => f.type === "email" || (f.type === "dropdown" && groupIdOfSource(f.optionsSource)))
    .map((f) => ({ id: f.id, label: f.type === "email" ? f.label || f.id : `${f.label || f.id} (בחירה מקבוצה)` }));
  const dateFields = wizard ? allFields(wizard.requesterDefinition).filter((f) => f.type === "date").map((f) => ({ id: f.id, label: f.label || f.id })) : [];
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
          <div className="space-y-1">
            <Label htmlFor="pk-org">{formId ? "הטופס זמין לארגון" : "זמינה לארגון"}</Label>
            <Select id="pk-org" name="organizationId" defaultValue={pkg.organizationId ?? ""}>
              <option value="">כל הארגונים</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </div>
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
      {saved && <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success">נשמר</p>}
      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">יש להזין שם לערכה</p>}
      {stepError && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">השלב לא נשמר: {stepError}</p>}
      {(problems.length > 0 || items.length === 0 || unpublishedRequired.length > 0) && (
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
              <Button type="submit" name="intent" value={it.required ? "optional" : "required"} variant="outline" size="sm">{it.required ? "חובה" : "רשות"}</Button>
              <Button type="submit" name="intent" value="up" variant="ghost" size="sm" disabled={i === 0} aria-label="העלאה">↑</Button>
              <Button type="submit" name="intent" value="down" variant="ghost" size="sm" disabled={i === items.length - 1} aria-label="הורדה">↓</Button>
              <Button type="submit" name="intent" value="remove" variant="ghost" size="sm">הסרה</Button>
            </form>
          ))}
          {addable.length > 0 && (
            <form action={documentAction} className="flex flex-wrap items-center gap-2 p-3">
              <input type="hidden" name="id" value={pkg.id} />
              <Select name="templateId" aria-label="טופס להוספה" className="max-w-xs">
                {addable.map((f) => <option key={f.id} value={f.id}>{f.title}{f.publishedVersion ? "" : " (לא פורסם)"}</option>)}
              </Select>
              <Button type="submit" name="intent" value="add" variant="outline">הוספת טופס</Button>
            </form>
          )}
        </Card>
      </section>}

      <section className="space-y-2" aria-labelledby="steps-h">
        <h2 id="steps-h" className="text-lg font-semibold">{formId ? "שלבי הטופס" : "מסלול חתימות"}</h2>
        <p className="text-sm text-muted-foreground">
          הטופס עובר לפי הסדר. בהגדרות כל שדה בוחרים באיזה שלב הוא מופיע. משתמשים וקבוצות מגדירים ב<Link href="/admin/users" className="underline">משתמשים</Link>.
        </p>
        <StepsEditor
          packageId={pkg.id}
          initial={pkg.workflow.steps.map(draftOf)}
          contacts={contacts.map((c) => ({ id: c.id, label: c.email ? `${c.name} · ${c.email}` : c.name }))}
          groups={groups.map((g) => ({ id: g.id, label: `${g.name} (${g.memberIds.length})` }))}
          emailFields={emailFields}
          save={saveStepsAction}
        />
      </section>

      {!formId && <form action={archivePackageAction} className="border-t pt-4">
        <input type="hidden" name="id" value={pkg.id} />
        <input type="hidden" name="archive" value={pkg.archivedAt ? "0" : "1"} />
        <Button type="submit" variant="ghost" className="text-destructive">{pkg.archivedAt ? "שחזור מהארכיון" : "העברה לארכיון"}</Button>
      </form>}
      <section className="space-y-2" aria-labelledby="settings-h">
        <h2 id="settings-h" className="text-lg font-semibold">{formId ? "הגדרות שליחה" : "הגדרות התהליך"}</h2>
        {settingsError && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {settingsError === "expiry" ? "יש לבחור יום ושדה תאריך לתפוגה" : `כתובות לא תקינות: ${settingsError}`}
          </p>
        )}
        <Card className="p-4">
          <form action={savePackageSettingsAction} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={pkg.id} />
            {returnTo}
            <div className="space-y-1">
              <Label htmlFor="pk-recipients">מקבלי המסמכים החתומים בסיום</Label>
              <Textarea id="pk-recipients" name="recipients" dir="ltr" rows={3} defaultValue={formatRecipients(pkg.completionRecipients)} placeholder={"חשבות שכר <payroll@misrad.org.il>\nhr@misrad.org.il"} />
              <p className="text-xs text-muted-foreground">שורה לכל נמען. מקבלים מייל עם קובצי ה-PDF החתומים, בנוסף לעובד ולמי שפתח את הבקשה.</p>
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox name="remindersEnabled" defaultChecked={pkg.remindersEnabled} />
              לשלוח תזכורות אוטומטיות עד שהשלב מסתיים
            </label>
            <details className="sm:col-span-2 rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">הגדרות נוספות: תוקף הקישורים וטיפול אחרי החתימה</summary>
              <div className="mt-3 grid gap-4">
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="text-sm font-medium">תוקף הקישורים</legend>
              <p className="text-xs text-muted-foreground">כרגע: {describeExpiryRule(rule, (fid) => dateFields.find((f) => f.id === fid)?.label ?? fid)}. אפשר להאריך כל בקשה בנפרד.</p>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label htmlFor="ex-kind">סוג</Label>
                  <Select id="ex-kind" name="expiryKind" defaultValue={rule?.kind ?? "default"}>
                    <option value="default">ברירת מחדל (30 יום)</option>
                    <option value="days">מספר ימים מהשליחה</option>
                    <option value="dayOfNextMonth">יום בחודש שאחרי תאריך</option>
                    <option value="none">ללא תפוגה</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ex-days">ימים</Label>
                  <Input id="ex-days" name="expiryDays" type="number" min={1} max={365} inputMode="numeric" defaultValue={rule?.kind === "days" ? rule.days : 30} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ex-day">יום בחודש</Label>
                  <Input id="ex-day" name="expiryDay" type="number" min={1} max={31} inputMode="numeric" defaultValue={rule?.kind === "dayOfNextMonth" ? rule.day : 7} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ex-field">אחרי התאריך בשדה</Label>
                  <Select id="ex-field" name="expiryField" defaultValue={rule?.kind === "dayOfNextMonth" ? rule.dateFieldId : (dateFields[0]?.id ?? "")}>
                    {dateFields.length === 0 && <option value="">אין שדה תאריך שממלא המבקש</option>}
                    {dateFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </Select>
                </div>
              </div>
            </fieldset>
            <div className="space-y-1">
              <Label htmlFor="pk-followup">טיפול אחרי החתימה</Label>
              <Textarea id="pk-followup" name="followUp" rows={3} defaultValue={followUps.map((f) => f.label).join("\n")} placeholder={"עודכן בשכר\nהוקם בפריוריטי"} />
              <p className="text-xs text-muted-foreground">שורה לכל שלב. הצוות מסמן אותם בבקשה אחרי שכולם חתמו.</p>
            </div>
              </div>
            </details>
            <div className="sm:col-span-2">
              <SubmitButton saved={saved === "settings"}>שמירת ההגדרות</SubmitButton>
            </div>
          </form>
        </Card>
      </section>
      {formId && orgCard}
    </div>
  );
}
