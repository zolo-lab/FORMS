import Link from "next/link";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { listTemplates } from "@/server/forms-store";
import { archiveFormAction, createFormAction, createFromTemplateAction, createPdfFormAction, duplicateFormAction, importFormAction } from "./actions";
import { FORM_TEMPLATES } from "@/lib/forms/templates";

export const dynamic = "force-dynamic";

const STATUS = { draft: ["טיוטה", "warning"], active: ["פעיל", "success"], archived: ["בארכיון", "muted"] } as const;

export default async function FormsListPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const templates = await listTemplates();
  const fmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" });
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <h1 className="text-2xl font-bold">טפסים</h1>
      {/* One kind of form, two starting points: from scratch, or from an existing PDF. Either way the same fields serve the responsive form and the PDF. */}
      <Card className="p-4">
        <form action={createFormAction} className="space-y-3">
          <h2 className="font-semibold">יצירת טופס חדש</h2>
          <div className="space-y-1">
            <label htmlFor="new-form-title" className="text-sm text-muted-foreground">שם הטופס</label>
            <Input id="new-form-title" name="title" placeholder="שם הטופס החדש" className="sm:w-80" />
          </div>
          <p className="text-sm text-muted-foreground">מאיפה מתחילים? בשני המקרים זה אותו טופס: אותם שדות משמשים גם לטופס הרספונסיבי וגם ל-PDF, ואפשר להוסיף PDF גם אחר כך.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="submit"
              className="flex flex-col items-start gap-1 rounded-lg border-2 border-primary/30 bg-card p-4 text-start transition hover:border-primary focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="text-base font-semibold">להתחיל מטופס ריק</span>
              <span className="text-sm text-muted-foreground">בונים את השדות, המקטעים והתנאים מאפס. העובד ממלא טופס רספונסיבי, ובסיום נוצר PDF מסכם; אפשר גם להעלות PDF קיים ולשבץ עליו את אותם שדות.</span>
            </button>
            <button
              type="submit"
              formAction={createPdfFormAction}
              className="flex flex-col items-start gap-1 rounded-lg border-2 border-primary/30 bg-card p-4 text-start transition hover:border-primary focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="text-base font-semibold">להתחיל מ-PDF קיים</span>
              <span className="text-sm text-muted-foreground">מעלים PDF (למשל טופס 101) ומשבצים עליו את השדות. אותם שדות מרכיבים גם את הטופס הרספונסיבי, והתשובות מוטבעות על המסמך המקורי.</span>
            </button>
          </div>
        </form>
      </Card>
      <Card className="p-4">
        <h2 className="mb-2 font-semibold">התחלה מתבנית</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {FORM_TEMPLATES.map((t) => (
            <form key={t.id} action={createFromTemplateAction} className="flex flex-col gap-2 rounded-md border p-3">
              <input type="hidden" name="template" value={t.id} />
              <span className="font-medium">{t.name}</span>
              <span className="text-sm text-muted-foreground">{t.description}</span>
              <div className="mt-auto flex gap-2">
                <Input name="title" placeholder={t.definition.title} aria-label={`שם הטופס מתבנית ${t.name}`} className="flex-1" />
                <Button type="submit" variant="outline">יצירה מתבנית</Button>
              </div>
            </form>
          ))}
        </div>
      </Card>
      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">הייבוא נכשל: {error === "json" ? "הקובץ אינו JSON תקין" : error === "template" ? "התבנית לא נמצאה" : "הגדרת הטופס אינה תקינה"}</p>}

      <Card className="divide-y">
        {templates.length === 0 && <p className="p-6 text-center text-muted-foreground">עדיין אין טפסים. צרו את הראשון למעלה.</p>}
        {templates.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-48 flex-1">
              <Link href={`/admin/forms/${t.id}`} className="font-medium hover:underline">{t.title}</Link>
              <p className="text-xs text-muted-foreground" dir="ltr">{t.slug}</p>
            </div>
            <Badge tone={STATUS[t.status][1]}>{STATUS[t.status][0]}</Badge>
            <span className="text-sm text-muted-foreground">{t.publishedVersion ? `גרסה ${t.publishedVersion}` : "לא פורסם"}</span>
            <span className="text-sm text-muted-foreground">{fmt.format(t.updatedAt)}</span>
            <div className="flex gap-1">
              <form action={duplicateFormAction}><input type="hidden" name="id" value={t.id} /><Button variant="ghost" size="sm" type="submit">שכפול</Button></form>
              <form action={archiveFormAction}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="archive" value={t.status === "archived" ? "0" : "1"} />
                <Button variant="ghost" size="sm" type="submit">{t.status === "archived" ? "שחזור" : "ארכוב"}</Button>
              </form>
            </div>
          </div>
        ))}
      </Card>

      <details className="rounded-lg border bg-card p-3">
        <summary className="cursor-pointer text-sm font-medium">ייבוא טופס מ-JSON</summary>
        <form action={importFormAction} className="mt-3 space-y-2">
          <Textarea name="json" dir="ltr" rows={6} placeholder='{"schemaVersion":1,"title":"…","pages":[…]}' required />
          <Button type="submit" variant="outline">ייבוא</Button>
        </form>
      </details>
    </main>
  );
}
