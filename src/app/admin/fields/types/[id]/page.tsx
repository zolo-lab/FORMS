import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button";
import { listDictionary } from "@/server/field-dictionary-store";
import { getListType } from "@/server/list-types-store";
import { deleteListTypeAction } from "../actions";
import { TypeEditor } from "./TypeEditor";
import { DeleteTypeButton } from "./DeleteTypeButton";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  full: "בסוג רשימה אפשר עד 40 שדות",
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
      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{ERRORS[error] ?? "שגיאה"}</p>}


      {/* Remounted after every save (and after a new field), so it starts from what is stored. */}
      <TypeEditor key={`${type.updatedAt.toISOString()}#${general.length}`} typeId={type.id} name={type.name} fields={type.fields} displayKey={type.displayKey} all={general} />

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
