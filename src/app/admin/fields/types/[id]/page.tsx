import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonVariants } from "@/components/ui/button";
import { DICTIONARY_TYPES, DICTIONARY_TYPE_LABELS } from "@/lib/fields/types";
import { listDictionary } from "@/server/field-dictionary-store";
import { getListType } from "@/server/list-types-store";
import { addNewFieldToTypeAction, deleteListTypeAction } from "../actions";
import { TypeEditor } from "./TypeEditor";
import { DeleteTypeButton } from "./DeleteTypeButton";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  label: "צריך שם לשדה",
  key: "השם הפנימי חייב להתחיל באות אנגלית, ואחריה אותיות, ספרות או קו תחתון",
  exists: "השם הפנימי הזה כבר תפוס",
};

export default async function ListTypePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const [{ id }, { error, saved }] = await Promise.all([params, searchParams]);
  const [type, dict] = await Promise.all([getListType(id), listDictionary()]);
  if (!type) notFound();
  const general = dict.filter((f) => f.category === "general").map((f) => ({ key: f.key, label: f.label, type: f.type }));
  return (
    <main className="space-y-6 px-4 pt-6 lg:px-8">
      <PageHeader title={type.name} actions={<Link href="/admin/fields/types" className={buttonVariants({ variant: "ghost" })}>כל סוגי הרשימות</Link>} />
      {saved === "new" && <p role="status" className="text-sm text-success">סוג הרשימה נוצר. הוסיפו לו שדות.</p>}
      {saved === "field" && <p role="status" className="text-sm text-success">השדה נוצר בשדות המזהים ונוסף לסוג.</p>}
      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{ERRORS[error] ?? "שגיאה"}</p>}


      {/* Remounted after every save (and after a new field), so it starts from what is stored. */}
      <TypeEditor key={`${type.updatedAt.toISOString()}#${general.length}`} typeId={type.id} name={type.name} fields={type.fields} displayKey={type.displayKey} all={general}>
        <Card className="space-y-3 p-4">
          <h2 className="font-semibold">שדה חדש</h2>
          <p className="text-sm text-muted-foreground">שדה שאין עדיין בשדות המזהים: הוא נוצר שם (וזמין לכל סוג רשימה) ונוסף לסוג הזה.</p>
          <form action={addNewFieldToTypeAction} className="grid gap-3 sm:grid-cols-[2fr_1fr_1.5fr_auto] sm:items-end">
            <input type="hidden" name="typeId" value={type.id} />
            <div className="space-y-1">
              <Label htmlFor="tf-label">שם השדה</Label>
              <Input id="tf-label" name="label" required maxLength={80} placeholder="למשל: סוג הלינה" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tf-type">סוג</Label>
              <Select id="tf-type" name="type" defaultValue="short_text">
                {DICTIONARY_TYPES.map((t) => <option key={t} value={t}>{DICTIONARY_TYPE_LABELS[t]}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="tf-key">שם פנימי (לא חובה)</Label>
              <Input id="tf-key" name="key" maxLength={40} dir="ltr" placeholder="ייווצר אוטומטית" pattern="[a-zA-Z][a-zA-Z0-9_]*" className="font-mono text-sm" />
            </div>
            <SubmitButton variant="outline">יצירה והוספה</SubmitButton>
          </form>
        </Card>
      </TypeEditor>

      <section aria-labelledby="del-type" className="space-y-2 border-t py-6">
        <h2 id="del-type" className="font-semibold">מחיקת סוג הרשימה</h2>
        <p className="text-sm text-muted-foreground">השדות עצמם נשארים בשדות המזהים.</p>
        <form action={deleteListTypeAction}>
          <input type="hidden" name="id" value={type.id} />
          <DeleteTypeButton name={type.name} />
        </form>
      </section>
    </main>
  );
}
