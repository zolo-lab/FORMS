import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listTemplates, requestCountsByTemplate } from "@/server/forms-store";
import { DeleteFormButton } from "./DeleteFormButton";
import { archiveFormAction, combineFormsAction, duplicateFormAction, importFormAction } from "./actions";
import { NewFormFromPdf } from "./NewFormFromPdf";

export const dynamic = "force-dynamic";

const STATUS = { draft: ["טיוטה", "warning"], active: ["פעיל", "success"], archived: ["בארכיון", "muted"] } as const;

export default async function FormsListPage({ searchParams }: { searchParams: Promise<{ error?: string; deleted?: string; combine?: string }> }) {
  const { error, deleted, combine } = await searchParams;
  const [templates, counts] = await Promise.all([listTemplates(), requestCountsByTemplate()]);
  const fmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" });
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <PageHeader title="תבניות טפסים" description="כל טופס מתחיל מ-PDF: המערכת קוראת אותו ומציעה את השדות, ואתם מתקנים בבונה. בכל טופס מגדירים גם את שלבי הטופס: מי ממלא ומי חותם, ובאיזה סדר." />
      {/* Every form starts from a PDF: the system reads it and proposes the fields. */}
      <NewFormFromPdf />
      {deleted && <p role="status" className="rounded-md bg-muted p-3 text-sm">הטופס נמחק.</p>}
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
              <Link href={`/admin/forms/${t.id}/flow`} className={buttonVariants({ variant: "ghost", size: "sm" })}>שלבי הטופס</Link>
              <form action={duplicateFormAction}><input type="hidden" name="id" value={t.id} /><Button variant="ghost" size="sm" type="submit">שכפול</Button></form>
              <form action={archiveFormAction}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="archive" value={t.status === "archived" ? "0" : "1"} />
                <Button variant="ghost" size="sm" type="submit">{t.status === "archived" ? "שחזור" : "ארכוב"}</Button>
              </form>
              <DeleteFormButton id={t.id} title={t.title} requests={counts.get(t.id) ?? 0} />
            </div>
          </div>
        ))}
      </Card>

      <details className="rounded-lg border bg-card p-3" open={!!combine}>
        <summary className="cursor-pointer text-sm font-medium">חיבור כמה טפסים לטופס אחד</summary>
        <p className="mt-2 text-sm text-muted-foreground">
          כמו &quot;קיט&quot; ב-iForms: נוצר טופס חדש שהמסמך שלו הוא המסמכים לפי הסדר, ויש לו את כל השדות שלהם. אחר כך מגדירים לו שלבי טופס משלו. הטפסים המקוריים לא משתנים.
        </p>
        {combine && <p role="alert" className="mt-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive">{combine === "title" ? "יש להזין שם לטופס החדש" : combine}</p>}
        <form action={combineFormsAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="combine-title">שם הטופס החדש</Label>
            <Input id="combine-title" name="title" placeholder="למשל: קליטת עובד – כל המסמכים" />
          </div>
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="space-y-1">
              <Label htmlFor={`combine-${n}`}>מסמך {n}{n > 2 ? " (רשות)" : ""}</Label>
              <Select id={`combine-${n}`} name="part" defaultValue="">
                <option value="">–</option>
                {templates.filter((t) => t.status !== "archived").map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </Select>
            </div>
          ))}
          <div className="sm:col-span-2"><Button type="submit" variant="outline">חיבור לטופס אחד</Button></div>
        </form>
      </details>

      <details className="rounded-lg border bg-card p-3">
        <summary className="cursor-pointer text-sm font-medium">ייבוא הגדרת טופס מ-JSON</summary>
        <p className="mt-2 text-sm text-muted-foreground">הטופס נוצר בלי מסמך; אחרי הייבוא מעלים לו את ה-PDF בלשונית &quot;מסמך PDF&quot;.</p>
        <form action={importFormAction} className="mt-3 space-y-2">
          <Textarea name="json" dir="ltr" rows={6} placeholder='{"schemaVersion":1,"title":"…","pages":[…]}' required />
          <Button type="submit" variant="outline">ייבוא</Button>
        </form>
      </details>
    </main>
  );
}
