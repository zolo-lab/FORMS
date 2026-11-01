import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { publicStart } from "@/lib/forms/public-link";
import { formPackageId } from "@/server/packages-store";
import { startPublicFillAction } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  name: "נא למלא שם מלא",
  email: "נא למלא כתובת מייל תקינה",
  org: "נא לבחור עמותה",
  unpublished: "הטופס עדיין לא פורסם",
  closed: "הטופס לא פתוח למילוי בקישור",
  input: "משהו השתבש, נסו שוב",
};

/** The form's own link (like iForms): a few details about who is filling, then the form itself on the usual page. */
export default async function PublicFormPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const [form] = /^[0-9a-f-]{36}$/i.test(id) ? await db.select().from(schema.formTemplates).where(eq(schema.formTemplates.id, id)) : [];
  if (!form) notFound();
  const closed = (text: string) => (
    <main className="mx-auto max-w-md px-4 py-16">
      <Card className="space-y-2 p-6 text-center">
        <h1 className="text-xl font-bold">{form.title}</h1>
        <p className="text-muted-foreground">{text}</p>
      </Card>
    </main>
  );
  if (!form.publishedVersion || form.status === "archived") return closed("הטופס לא פתוח כרגע למילוי.");
  const [pkg] = await db.select().from(schema.packageTemplates).where(eq(schema.packageTemplates.id, await formPackageId(id)));
  const start = publicStart(pkg?.workflow.steps ?? []);
  if (!pkg || pkg.archivedAt || !start.ok) return closed("הטופס הזה מתחיל אצל מישהו אחר ולא נפתח למילוי בקישור.");
  const orgs = pkg.organizationId ? [] : await db.select({ id: schema.organizations.id, name: schema.organizations.name, active: schema.organizations.active }).from(schema.organizations).orderBy(asc(schema.organizations.name));
  const activeOrgs = orgs.filter((o) => o.active);
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Card className="space-y-5 p-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{form.title}</h1>
          <p className="text-sm text-muted-foreground">כמה פרטים קודם, ואז נפתח הטופס למילוי. העותק וההמשך יישלחו למייל שלכם.</p>
        </header>
        {error && ERRORS[error] && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{ERRORS[error]}</p>}
        <form action={startPublicFillAction} className="space-y-4">
          <input type="hidden" name="formId" value={form.id} />
          <div className="hidden" aria-hidden>
            <label>אתר <input name="website" tabIndex={-1} autoComplete="off" /></label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-name">שם מלא *</Label>
            <Input id="f-name" name="name" required autoComplete="name" maxLength={120} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-email">מייל *</Label>
            <Input id="f-email" name="email" type="email" required dir="ltr" autoComplete="email" maxLength={200} className="text-start" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-phone">טלפון נייד</Label>
            <Input id="f-phone" name="phone" type="tel" dir="ltr" autoComplete="tel" maxLength={30} className="text-start" />
          </div>
          {!pkg.organizationId && (
            <div className="space-y-1">
              <Label htmlFor="f-org">עמותה *</Label>
              <Select id="f-org" name="organizationId" required defaultValue="">
                <option value="" disabled>בחרו…</option>
                {activeOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </div>
          )}
          <SubmitButton className="w-full" pendingText="פותח את הטופס…">המשך למילוי</SubmitButton>
        </form>
      </Card>
    </main>
  );
}
