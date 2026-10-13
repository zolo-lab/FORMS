import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABELS } from "@/lib/workflow/labels";
import { STEP_ACTIONS } from "@/lib/workflow/types";
import { validateWorkflow } from "@/lib/workflow/validate-workflow";
import { listOrgs } from "@/server/orgs-store";
import { availableForms, getPackage } from "@/server/packages-store";
import { archivePackageAction, documentAction, savePackageAction, stepAction } from "../actions";

export const dynamic = "force-dynamic";

const ACTION_LABELS: Record<(typeof STEP_ACTIONS)[number], string> = {
  fill: "מילוי",
  sign: "חתימה",
  fill_and_sign: "מילוי וחתימה",
  approve: "אישור",
  view: "צפייה בלבד",
};

export default async function PackagePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string; stepError?: string }> }) {
  const { id } = await params;
  const { saved, error, stepError } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getPackage(id);
  if (!data) notFound();
  const { pkg, items } = data;
  const [orgs, forms] = await Promise.all([listOrgs(), availableForms()]);
  const inPackage = new Set(items.map((i) => i.templateId));
  const addable = forms.filter((f) => !inPackage.has(f.id));
  const problems = validateWorkflow(pkg.workflow);
  const unpublishedRequired = items.filter((i) => i.required && !i.publishedVersion);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/packages" className="text-sm text-muted-foreground hover:text-foreground">→ כל הערכות</Link>
        <h1 className="text-2xl font-bold">{pkg.name}</h1>
        {pkg.archivedAt && <Badge tone="muted">בארכיון</Badge>}
      </div>
      {saved && <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success">נשמר</p>}
      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">יש להזין שם לערכה</p>}
      {stepError && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">השלב לא נשמר: {stepError}</p>}
      {(problems.length > 0 || items.length === 0 || unpublishedRequired.length > 0) && (
        <Card className="space-y-1 border-warning p-4 text-sm" role="status">
          <p className="font-medium">לא ניתן עדיין ליצור בקשות מהערכה הזאת:</p>
          <ul className="list-inside list-disc text-muted-foreground">
            {items.length === 0 && <li>הוסיפו לפחות טופס אחד</li>}
            {unpublishedRequired.map((i) => <li key={i.id}>הטופס &quot;{i.title}&quot; עדיין לא פורסם</li>)}
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </Card>
      )}

      <Card className="p-4">
        <form action={savePackageAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={pkg.id} />
          <div className="space-y-1">
            <Label htmlFor="pk-name">שם הערכה</Label>
            <Input id="pk-name" name="name" defaultValue={pkg.name} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pk-org">זמינה לארגון</Label>
            <Select id="pk-org" name="organizationId" defaultValue={pkg.organizationId ?? ""}>
              <option value="">כל הארגונים</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="pk-desc">תיאור</Label>
            <Textarea id="pk-desc" name="description" defaultValue={pkg.description ?? ""} rows={2} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit">שמירה</Button>
          </div>
        </form>
      </Card>

      <section className="space-y-2" aria-labelledby="docs-h">
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
      </section>

      <section className="space-y-2" aria-labelledby="steps-h">
        <h2 id="steps-h" className="text-lg font-semibold">מסלול חתימות</h2>
        <p className="text-sm text-muted-foreground">שלבים עם אותו מספר סדר פועלים במקביל. המבקש והעובד מזוהים לפי הבקשה; לשאר התפקידים יש להגדיר נמען קבוע.</p>
        <div className="space-y-3">
          {pkg.workflow.steps.map((s, i) => (
            <Card key={i} className="p-3">
              <form action={stepAction} className="grid gap-3 sm:grid-cols-6">
                <input type="hidden" name="id" value={pkg.id} />
                <input type="hidden" name="index" value={i} />
                <div className="space-y-1">
                  <Label htmlFor={`s${i}-order`}>סדר</Label>
                  <Input id={`s${i}-order`} name="order" type="number" min={1} defaultValue={s.order} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor={`s${i}-role`}>תפקיד</Label>
                  <Select id={`s${i}-role`} name="role" defaultValue={s.role}>
                    {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor={`s${i}-action`}>פעולה</Label>
                  <Select id={`s${i}-action`} name="action" defaultValue={s.action}>
                    {STEP_ACTIONS.map((a) => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`s${i}-due`}>יעד (שעות)</Label>
                  <Input id={`s${i}-due`} name="dueHours" type="number" min={1} defaultValue={s.dueHours ?? ""} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor={`s${i}-an`}>שם הנמען הקבוע</Label>
                  <Input id={`s${i}-an`} name="assigneeName" defaultValue={s.assignee?.name ?? ""} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor={`s${i}-ae`}>מייל</Label>
                  <Input id={`s${i}-ae`} name="assigneeEmail" type="email" dir="ltr" defaultValue={s.assignee?.email ?? ""} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor={`s${i}-ap`}>טלפון</Label>
                  <Input id={`s${i}-ap`} name="assigneePhone" type="tel" dir="ltr" defaultValue={s.assignee?.phone ?? ""} />
                </div>
                <div className="space-y-1 sm:col-span-3">
                  <Label htmlFor={`s${i}-af`}>או: מזהה שדה שממנו נלקח הנמען</Label>
                  <Input id={`s${i}-af`} name="assigneeFromFieldId" dir="ltr" defaultValue={s.assigneeFromFieldId ?? ""} />
                </div>
                <label className="flex items-center gap-2 text-sm sm:col-span-3">
                  <Checkbox name="otpRequired" defaultChecked={!!s.otpRequired} />
                  אימות בקוד במייל לפני מילוי
                </label>
                <div className="flex gap-2 sm:col-span-6">
                  <Button type="submit" name="intent" value="save" size="sm">שמירת שלב {i + 1}</Button>
                  <Button type="submit" name="intent" value="delete" variant="ghost" size="sm">מחיקה</Button>
                </div>
              </form>
            </Card>
          ))}
          <form action={stepAction}>
            <input type="hidden" name="id" value={pkg.id} />
            <Button type="submit" name="intent" value="add" variant="outline">הוספת שלב</Button>
          </form>
        </div>
      </section>

      <form action={archivePackageAction} className="border-t pt-4">
        <input type="hidden" name="id" value={pkg.id} />
        <input type="hidden" name="archive" value={pkg.archivedAt ? "0" : "1"} />
        <Button type="submit" variant="ghost" className="text-destructive">{pkg.archivedAt ? "שחזור מהארכיון" : "העברה לארכיון"}</Button>
      </form>
    </main>
  );
}
