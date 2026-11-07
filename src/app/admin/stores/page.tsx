import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { listStores } from "@/server/stores-store";
import { createStoreAction } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  name: "צריך שם למאגר",
  columns: "צריך לפחות עמודה אחת",
};

const dateFmt = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Jerusalem" });

/** Data stores: shared tables (suppliers, farms, branches…) that a form lists in a dropdown and fills other fields from. */
export default async function StoresPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { error, saved } = await searchParams;
  const stores = await listStores();
  return (
    <main className="space-y-6 px-4 py-6 lg:px-8">
      <PageHeader
        title="מאגרי נתונים"
        description="טבלאות משותפות לכל העמותות – ספקים, חוות, סניפים. בטופס בוחרים שורה מהמאגר ברשימה נפתחת, ושדות אחרים (כתובת, ח״פ, בנק) מתמלאים ממנה, כמו שדות העמותה."
      />
      {saved === "deleted" && <p role="status" className="text-sm text-success">המאגר נמחק.</p>}

      {stores.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-start font-medium">שם</th>
                <th scope="col" className="px-3 py-2 text-start font-medium">עמודות</th>
                <th scope="col" className="w-20 px-3 py-2 text-start font-medium">שורות</th>
                <th scope="col" className="w-28 px-3 py-2 text-start font-medium">עודכן</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <tr key={s.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <Link href={`/admin/stores/${s.id}`} className="font-medium underline-offset-2 hover:underline">{s.name}</Link>
                    {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{s.columns.map((c) => c.label).join(" · ")}</td>
                  <td className="px-3 py-2 tabular-nums">{s.rowCount}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{dateFmt.format(s.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">עדיין אין מאגרים.</p>
      )}

      <Card className="max-w-xl space-y-3 p-4">
        <h2 className="font-semibold">מאגר חדש</h2>
        {error && <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{ERRORS[error] ?? "שגיאה"}</p>}
        <form action={createStoreAction} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="store-name">שם המאגר</Label>
            <Input id="store-name" name="name" required maxLength={120} placeholder="למשל: ספקים" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="store-columns">עמודות (שורה לכל עמודה, או מופרדות בפסיק)</Label>
            <Textarea id="store-columns" name="columns" required rows={4} placeholder={"שם ספק\nח\"פ\nכתובת\nטלפון"} />
            <p className="text-xs text-muted-foreground">העמודה הראשונה היא מה שמופיע ברשימה הנפתחת. אפשר להוסיף, לשנות שם ולמחוק עמודות אחר כך.</p>
          </div>
          <SubmitButton>יצירת המאגר</SubmitButton>
        </form>
      </Card>
    </main>
  );
}
