import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FIXED_SOURCES, VALUE_FORMATS, VALUE_FORMAT_LABELS, applyTemplate, mappableFields, type ColumnSource } from "@/lib/export/template";
import { listPackageSummaries } from "@/server/packages-store";
import { loadExport } from "@/server/export-store";
import { getExportTemplate, packageDefinitions, recentRequestIds } from "@/server/export-templates-store";
import { saveExportTemplateAction } from "../actions";

export const dynamic = "force-dynamic";

const sourceValue = (s: ColumnSource) =>
  s.kind === "fixed" ? `fixed:${s.key}` : s.kind === "field" ? `field:${s.key}${s.part ? `.${s.part}` : ""}` : s.kind;

export default async function ExportTemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; created?: string }> }) {
  const { id } = await params;
  const { saved, created } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const t = await getExportTemplate(id);
  if (!t) notFound();
  const [packages, defs, recent] = await Promise.all([
    listPackageSummaries(),
    t.packageTemplateId ? packageDefinitions(t.packageTemplateId) : Promise.resolve([]),
    t.packageTemplateId ? recentRequestIds(t.packageTemplateId) : Promise.resolve([]),
  ]);
  const fields = mappableFields(defs);
  const preview = recent.length ? applyTemplate({ ...t.template, includeHeader: true }, await loadExport({ ids: recent })) : [];
  const unmapped = t.template.columns.filter((c) => c.source.kind === "empty").length;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <nav className="text-sm"><Link href="/admin/settings/exports" className="text-muted-foreground hover:underline">תבניות ייצוא</Link></nav>
      <h1 className="text-2xl font-bold">{t.name}</h1>
      {created && <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success">התבנית נוצרה. עמודות שזוהו חוברו אוטומטית; בדקו את השאר.</p>}
      {saved && <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success">נשמר</p>}

      <form action={saveExportTemplateAction} className="space-y-4">
        <input type="hidden" name="id" value={t.id} />
        <input type="hidden" name="count" value={t.template.columns.length} />
        <Card className="grid gap-3 p-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="et-name">שם</Label>
            <Input id="et-name" name="name" defaultValue={t.name} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="et-pkg">ערכה</Label>
            <Select id="et-pkg" name="packageTemplateId" defaultValue={t.packageTemplateId ?? ""}>
              <option value="">ללא – לפי מזהי שדות</option>
              {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="et-sheet">שם הגיליון בקובץ</Label>
            <Input id="et-sheet" name="sheetName" defaultValue={t.template.sheetName ?? ""} placeholder="Sheet1" dir="ltr" />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-3">
            <Checkbox name="includeHeader" defaultChecked={t.template.includeHeader !== false} />
            שורת כותרות בראש הקובץ
          </label>
        </Card>

        <Card className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <caption className="p-3 text-start text-muted-foreground">
              {t.template.columns.length} עמודות{unmapped ? ` · ${unmapped} עדיין ריקות` : ""}. לכל עמודה: מאיפה הערך, ואיך לכתוב אותו.
            </caption>
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-3 py-2 text-start font-medium">#</th>
                <th className="px-3 py-2 text-start font-medium">עמודה בקובץ</th>
                <th className="px-3 py-2 text-start font-medium">מקור הערך</th>
                <th className="px-3 py-2 text-start font-medium">ערך קבוע</th>
                <th className="px-3 py-2 text-start font-medium">פורמט</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {t.template.columns.map((c, i) => (
                <tr key={i} className={c.source.kind === "empty" ? "bg-muted/40" : undefined}>
                  <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2"><Input name={`h${i}`} defaultValue={c.header} aria-label={`שם עמודה ${i + 1}`} className="h-8" /></td>
                  <td className="px-3 py-2">
                    <Select name={`s${i}`} defaultValue={sourceValue(c.source)} aria-label={`מקור עמודה ${i + 1}`} className="h-8">
                      <option value="empty">– ריקה –</option>
                      <option value="const">ערך קבוע</option>
                      <optgroup label="נתוני הבקשה">
                        {Object.entries(FIXED_SOURCES).map(([k, l]) => <option key={k} value={`fixed:${k}`}>{l}</option>)}
                      </optgroup>
                      {fields.length > 0 && (
                        <optgroup label="שדות בטפסים">
                          {fields.map((f) => <option key={`${f.key}.${f.part ?? ""}`} value={`field:${f.key}${f.part ? `.${f.part}` : ""}`}>{f.label}</option>)}
                        </optgroup>
                      )}
                      {c.source.kind === "field" && !fields.some((f) => f.key === (c.source as { key: string }).key) && (
                        <option value={sourceValue(c.source)}>{(c.source as { key: string }).key}</option>
                      )}
                    </Select>
                  </td>
                  <td className="px-3 py-2"><Input name={`c${i}`} defaultValue={c.source.kind === "const" ? c.source.value : ""} aria-label={`ערך קבוע לעמודה ${i + 1}`} className="h-8" /></td>
                  <td className="px-3 py-2">
                    <Select name={`f${i}`} defaultValue={c.format ?? "text"} aria-label={`פורמט עמודה ${i + 1}`} className="h-8">
                      {VALUE_FORMATS.map((f) => <option key={f} value={f}>{VALUE_FORMAT_LABELS[f]}</option>)}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="intent" value="save">שמירה</Button>
          <Button type="submit" name="intent" value="add" variant="outline">הוספת עמודה</Button>
          <Button type="submit" name="intent" value="delete" variant="ghost">מחיקת התבנית</Button>
        </div>
      </form>

      <section className="space-y-2" aria-labelledby="et-preview">
        <h2 id="et-preview" className="text-lg font-semibold">תצוגה מקדימה</h2>
        {preview.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.packageTemplateId ? "אין עדיין בקשות בערכה הזו." : "בחרו ערכה כדי לראות את 5 הבקשות האחרונות בפורמט הזה."}</p>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">{preview[0]!.map((h, i) => <th key={i} className="whitespace-nowrap px-2 py-1 text-start font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {preview.slice(1).map((r, ri) => (
                  <tr key={ri}>{r.map((v, i) => <td key={i} className="whitespace-nowrap px-2 py-1">{v}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </main>
  );
}
