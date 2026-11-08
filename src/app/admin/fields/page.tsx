import Link from "next/link";
import { redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { DICTIONARY_TYPES, DICTIONARY_TYPE_LABELS, ORG_FIELD_TYPES } from "@/lib/fields/types";
import { listDictionary } from "@/server/field-dictionary-store";
import { listListTypes } from "@/server/list-types-store";
import { deleteFieldAction, updateFieldAction } from "./actions";
import { NewFieldDialog } from "./NewFieldDialog";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  label: "צריך שם לשדה",
  key: "השם הפנימי חייב להתחיל באות אנגלית, ואחריה אותיות, ספרות או קו תחתון (עד 40 תווים)",
  exists: "השם הפנימי הזה כבר תפוס",
  missing: "השדה לא נמצא",
  type: "שדה עמותה מקבל רק סוג של שורה אחת (טקסט, מספר, סכום, אחוז, ת״ז, טלפון, מייל, תאריך)",
};

/**
 * Every identifying field in one table: the organizations' own (filled per organization) and the general ones that
 * lists of suppliers, work places… are built from. People work with the Hebrew name; the internal name is made from
 * it and can be changed.
 */
/** The organizations' columns live on the "רשימות" sheet now; the dictionary stays reachable by its sub-pages. */
export default async function FieldsPage({ searchParams }: { searchParams: Promise<{ error?: string; nerror?: string; saved?: string; key?: string; q?: string; types?: string; list?: string }> }) {
  const { error, nerror, saved, key, q, types, list } = await searchParams;
  if (!error && !nerror && !saved && !q && !list) redirect("/admin/lists");
  const [all, listTypes] = await Promise.all([listDictionary(), listListTypes()]);
  const query = q?.trim().toLowerCase() ?? "";
  // Which lists each field is in: the organizations' fields are the built-in "עמותות" list.
  const inLists = (f: (typeof all)[number]) => (f.category === "org" ? ["עמותות"] : listTypes.filter((t) => t.fields.includes(f.key)).map((t) => t.name));
  const byList = (f: (typeof all)[number]) =>
    !list ? true : list === "org" ? f.category === "org" : list === "none" ? f.category === "general" && inLists(f).length === 0 : listTypes.some((t) => t.id === list && t.fields.includes(f.key));
  const rows = all.filter((f) => (!query || f.label.toLowerCase().includes(query) || f.key.toLowerCase().includes(query)) && byList(f));

  return (
    <main className="space-y-6 px-4 py-6 lg:px-8">
      <PageHeader
        title="שדות מזהים"
        description="כל השדות המזהים במקום אחד: שדות העמותה (לכל עמותה הערך שלה) ושדות כלליים (שם ספק, ח״פ, בנק…) שמהם בונים רשימות. כותבים שם בעברית – השם הפנימי שהטפסים מצביעים עליו נוצר ממנו אוטומטית, ואפשר לשנות אותו."
      />
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error === "inUse" ? `אי אפשר למחוק: השדה בשימוש בסוגי הרשימות ${types ?? ""}. הסירו אותו משם קודם.` : (ERRORS[error] ?? "שגיאה")}
        </p>
      )}
      {saved === "new" && <p role="status" className="text-sm text-success">השדה נוסף{key ? <> בשם הפנימי <bdi dir="ltr" className="font-mono">{key}</bdi></> : null}.</p>}
      {saved === "deleted" && <p role="status" className="text-sm text-success">השדה נמחק.</p>}


      <section aria-labelledby="list-title" className="space-y-3">
        <h2 id="list-title" className="font-semibold">כל השדות ({all.length})</h2>
        <div className="flex flex-wrap items-center justify-start gap-2">
          <NewFieldDialog initialOpen={!!nerror} error={nerror ? (ERRORS[nerror] ?? "שגיאה") : null} />
          <form className="flex items-center gap-2" role="search">
            <Label htmlFor="fq" className="sr-only">חיפוש</Label>
            <Input id="fq" name="q" defaultValue={q ?? ""} placeholder="חיפוש בשם" className="w-56" />
            <Label htmlFor="fl" className="sr-only">רשימה</Label>
            <Select id="fl" name="list" defaultValue={list ?? ""} className="w-48">
              <option value="">כל הרשימות</option>
              <option value="org">עמותות</option>
              {listTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              <option value="none">לא בשום רשימה</option>
            </Select>
            <SubmitButton variant="outline">חיפוש</SubmitButton>
          </form>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{query || list ? "אין שדות שתואמים לחיפוש." : "עדיין אין שדות מזהים."}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start font-medium">שם השדה</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">שם פנימי</th>
                  <th scope="col" className="w-36 px-3 py-2 text-start font-medium">סוג</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">ברשימות</th>
                  <th scope="col" className="w-36 px-3 py-2"><span className="sr-only">פעולות</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => {
                  const form = `field-${f.id}`;
                  const typeOptions = f.category === "org" ? ORG_FIELD_TYPES : DICTIONARY_TYPES;
                  return (
                    <tr key={f.id} className="border-t">
                      <td className="px-3 py-1.5">
                        <Input form={form} name="label" defaultValue={f.label} required maxLength={80} aria-label={`שם השדה – ${f.label}`} className="h-9" />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input form={form} name="key" defaultValue={f.key} required maxLength={40} dir="ltr" pattern={f.category === "org" ? "[a-zA-Z][a-zA-Z0-9_-]*" : "[a-zA-Z][a-zA-Z0-9_]*"} aria-label={`שם פנימי – ${f.label}`} className="h-9 font-mono text-xs" />
                      </td>
                      <td className="px-3 py-1.5">
                        <Select form={form} name="type" defaultValue={f.type} aria-label={`סוג – ${f.label}`} className="h-9">
                          {typeOptions.map((t) => <option key={t} value={t}>{DICTIONARY_TYPE_LABELS[t]}</option>)}
                        </Select>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="flex flex-wrap gap-1">
                          {inLists(f).length ? inLists(f).map((n) => <Badge key={n} tone={f.category === "org" ? "default" : "muted"}>{n}</Badge>) : <span className="text-xs text-muted-foreground">—</span>}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="flex items-center justify-end gap-1">
                          <form id={form} action={updateFieldAction}>
                            <input type="hidden" name="id" value={f.id} />
                            <input type="hidden" name="category" value={f.category} />
                            <SubmitButton size="sm" variant="outline" saved={saved === f.id}>שמירה</SubmitButton>
                          </form>
                          {f.category === "general" ? (
                            <form action={deleteFieldAction}>
                              <input type="hidden" name="id" value={f.id} />
                              <SubmitButton size="icon" variant="ghost" className="text-destructive" aria-label={`מחיקת השדה ${f.label}`} title="מחיקה">
                                <Trash2 className="size-4" aria-hidden />
                              </SubmitButton>
                            </form>
                          ) : (
                            <Link href="/admin/settings/organizations" className="px-2 text-xs text-muted-foreground underline" title="מחיקת שדה עמותה – במסך העמותות">בעמותות</Link>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">שינוי שם פנימי של שדה עמותה מעדכן אוטומטית את כל הטפסים ואת הערכים של כל העמותות.</p>
      </section>
    </main>
  );
}
