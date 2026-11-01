import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listPackageSummaries } from "@/server/packages-store";
import { listExportTemplates } from "@/server/export-templates-store";
import { createExportTemplateAction } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  name: "יש להזין שם לתבנית",
  file: "לא הצלחנו לקרוא את הקובץ. העלו XLSX או CSV",
  size: "הקובץ גדול מ-5MB",
  headers: "לא נמצאה שורת כותרות. העלו קובץ, או הקלידו את שמות העמודות",
};

export default async function ExportTemplatesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [templates, packages] = await Promise.all([listExportTemplates(), listPackageSummaries()]);
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <PageHeader title="תבניות ייצוא" description={<>מעלים את הקובץ שהמערכת השנייה מצפה לו (למשל תבנית ההעלאה לפריוריטי), מחברים כל עמודה פעם אחת לשדה בטופס, והייצוא מדף הבקשות יוצא
          בדיוק בפורמט הזה.</>} />
      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{ERRORS[error] ?? "שגיאה"}</p>}

      <Card className="p-4">
        <form action={createExportTemplateAction} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="et-name">שם התבנית</Label>
            <Input id="et-name" name="name" placeholder='למשל "פריוריטי – קליטת עובדים"' required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="et-pkg">טופס (ממנו לוקחים את השדות)</Label>
            <Select id="et-pkg" name="packageTemplateId" defaultValue="">
              <option value="">ללא – לפי מזהי שדות</option>
              {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="et-file">קובץ התבנית (XLSX / CSV)</Label>
            <Input id="et-file" name="file" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
            <p className="text-xs text-muted-foreground">השורה הראשונה שאינה ריקה היא שמות העמודות.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="et-headers">או: שמות העמודות</Label>
            <Textarea id="et-headers" name="headers" rows={3} placeholder="מופרדים בפסיק או בשורות" />
          </div>
          <div className="sm:col-span-2"><Button type="submit">יצירת תבנית</Button></div>
        </form>
      </Card>

      <section className="space-y-2" aria-labelledby="et-list">
        <h2 id="et-list" className="text-lg font-semibold">תבניות ({templates.length})</h2>
        {templates.length === 0 && <p className="text-sm text-muted-foreground">עדיין אין תבניות.</p>}
        <ul className="divide-y rounded-lg border bg-card">
          {templates.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 p-3">
              <Link href={`/admin/settings/exports/${t.id}`} className="font-medium hover:underline">{t.name}</Link>
              <span className="text-sm text-muted-foreground">{t.packageName ?? "כל הטפסים"} · {t.template.columns.length} עמודות</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
