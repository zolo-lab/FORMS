import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, Card } from "@/components/ui/card";
import { listDictionary } from "@/server/field-dictionary-store";
import { listListTypes } from "@/server/list-types-store";
import { NewTypeDialog } from "./NewTypeDialog";

export const dynamic = "force-dynamic";

/**
 * List types: what a kind of list holds (suppliers: name, company number, bank…). Lists of that kind (lodging
 * suppliers, instructors…) are built on a type. "עמותות" is built in: its fields are the organizations' fields.
 */
export default async function ListTypesPage({ searchParams }: { searchParams: Promise<{ nerror?: string; saved?: string }> }) {
  const { nerror, saved } = await searchParams;
  const [types, dict] = await Promise.all([listListTypes(), listDictionary()]);
  const label = new Map(dict.map((f) => [f.key, f.label]));
  const orgFields = dict.filter((f) => f.category === "org");

  return (
    <main className="space-y-6 px-4 py-6 lg:px-8">
      <PageHeader
        title="סוגי רשימות"
        description="סוג רשימה הוא קבוצת שדות מזהים – למשל ספקים: שם ספק, ח״פ, כתובת, בנק. על כל סוג בונים רשימות (ספקי לינה, מנחים…), ובטופס בוחרים רשומה מהרשימה והשדות מתמלאים ממנה."
      />
      {saved === "deleted" && <p role="status" className="text-sm text-success">סוג הרשימה נמחק.</p>}
      <div className="flex justify-start">
        <NewTypeDialog initialOpen={!!nerror} error={nerror ? "צריך שם לסוג הרשימה" : null} />
      </div>

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <li>
          <Card className="h-full space-y-2 p-4">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">עמותות</h2>
              <Badge tone="muted">מובנה</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {orgFields.length ? orgFields.map((f) => f.label).join(" · ") : "אין עדיין שדות עמותה"}
            </p>
            <Link href="/admin/settings/organizations" className="text-sm underline underline-offset-2">הערכים של כל עמותה – במסך העמותות</Link>
          </Card>
        </li>
        {types.map((t) => (
          <li key={t.id}>
            <Link href={`/admin/fields/types/${t.id}`} className="block h-full rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
              <Card className="h-full space-y-2 p-4 hover:bg-muted/30">
                <h2 className="font-semibold">{t.name}</h2>
                <p className="text-sm text-muted-foreground">{t.fields.length ? t.fields.map((k) => label.get(k) ?? k).join(" · ") : "עדיין אין שדות"}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
