import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox, Radio } from "@/components/ui/checkbox";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonVariants } from "@/components/ui/button";
import { getStore } from "@/server/stores-store";
import { deleteStoreAction, importStoreAction, renameStoreAction } from "../actions";
import { StoreEditor } from "./StoreEditor";
import { DeleteStoreButton } from "./DeleteStoreButton";

export const dynamic = "force-dynamic";

const editorKey = (columns: { key: string; label: string }[], rows: { id: string; updatedAt: Date }[]) =>
  `${columns.map((c) => `${c.key}:${c.label}`).join("|")}#${rows.length}#${rows.reduce((m, r) => Math.max(m, r.updatedAt.getTime()), 0)}#${rows.map((r) => r.id.slice(0, 8)).join("")}`;

const ERRORS: Record<string, string> = {
  file: "בחרו קובץ אקסל או CSV",
  big: "הקובץ גדול מדי (עד 5MB)",
  parse: "לא הצלחנו לקרוא את הקובץ. שמרו אותו כ-xlsx או CSV ונסו שוב.",
  empty: "לא נמצאו שורות: שורת הכותרת בקובץ צריכה להכיל את שמות העמודות של המאגר.",
};

export default async function StorePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string; n?: string; skipped?: string; cut?: string }> }) {
  const [{ id }, { error, saved, n, skipped, cut }] = await Promise.all([params, searchParams]);
  const data = await getStore(id);
  if (!data) notFound();
  const { store, rows } = data;
  return (
    <main className="space-y-6 px-4 pt-6 lg:px-8">
      <PageHeader
        title={store.name}
        description="משותף לכל העמותות. בבונה הטפסים: רשימה נפתחת שמקורה במאגר, ושדות אחרים שממלאים את עצמם מהשורה שנבחרה."
        actions={
          <>
            <Link href="/admin/stores" className={buttonVariants({ variant: "ghost" })}>כל המאגרים</Link>
            <a href={`/api/admin/stores/${store.id}/export`} className={buttonVariants({ variant: "outline" })}><Download className="size-4" aria-hidden />ייצוא לאקסל</a>
          </>
        }
      />
      {saved === "new" && <p role="status" className="text-sm text-success">המאגר נוצר. הוסיפו שורות או ייבאו מאקסל.</p>}
      {saved === "import" && (
        <p role="status" className="text-sm text-success">
          יובאו {n} שורות.{skipped && <span className="text-muted-foreground"> עמודות בקובץ שלא נקלטו: {skipped}</span>}
          {cut && <span className="text-destructive"> {cut} שורות לא יובאו: במאגר אפשר עד 2,000 שורות.</span>}
        </p>
      )}
      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{ERRORS[error] ?? "שגיאה"}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <h2 className="font-semibold">פרטים</h2>
          <form action={renameStoreAction} className="space-y-3">
            <input type="hidden" name="id" value={store.id} />
            <div className="space-y-1">
              <Label htmlFor="s-name">שם המאגר</Label>
              <Input id="s-name" name="name" defaultValue={store.name} required maxLength={120} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="s-desc">תיאור (לא חובה)</Label>
              <Input id="s-desc" name="description" defaultValue={store.description ?? ""} maxLength={500} />
            </div>
            <SubmitButton variant="outline">שמירת הפרטים</SubmitButton>
          </form>
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="font-semibold">ייבוא מאקסל</h2>
          <p className="text-sm text-muted-foreground">השורה הראשונה בקובץ היא שמות העמודות, והן מותאמות לפי השם. אפשר להוריד את הקובץ בייצוא, למלא ולייבא בחזרה.</p>
          <form action={importStoreAction} data-store-form="import" className="space-y-3">
            <input type="hidden" name="id" value={store.id} />
            <div className="space-y-1">
              <Label htmlFor="s-file">קובץ (xlsx או CSV)</Label>
              <Input id="s-file" name="file" type="file" required accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="h-auto py-2" />
            </div>
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">מה לעשות עם השורות הקיימות</legend>
              <label className="flex min-h-11 items-center gap-2 text-sm"><Radio name="mode" value="append" defaultChecked /> להוסיף אחריהן</label>
              <label className="flex min-h-11 items-center gap-2 text-sm"><Radio name="mode" value="replace" /> להחליף את כולן ({rows.length})</label>
            </fieldset>
            <label className="flex min-h-11 items-center gap-2 text-sm"><Checkbox name="addColumns" /> עמודה בקובץ שאין במאגר – להוסיף אותה כעמודה חדשה</label>
            <SubmitButton variant="outline">ייבוא</SubmitButton>
          </form>
        </Card>
      </div>

      {/* Remounted when the columns or rows change (a save, an import), so new rows get the ids the server gave
          them; renaming the store does not touch them and so keeps unsaved edits. */}
      <StoreEditor key={editorKey(store.columns, rows)} storeId={store.id} columns={store.columns} displayColumn={store.displayColumn} rows={rows.map((r) => ({ id: r.id, values: r.values }))} />

      <section aria-labelledby="danger-title" className="space-y-2 border-t py-6">
        <h2 id="danger-title" className="font-semibold">מחיקת המאגר</h2>
        <p className="text-sm text-muted-foreground">מוחק את המאגר ואת כל {rows.length} השורות שלו. אי אפשר לבטל.</p>
        <form action={deleteStoreAction}>
          <input type="hidden" name="id" value={store.id} />
          <DeleteStoreButton name={store.name} rows={rows.length} />
        </form>
      </section>
    </main>
  );
}
