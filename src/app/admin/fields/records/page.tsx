import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { listDictionary } from "@/server/field-dictionary-store";
import { listListTypes, listRecordsOf, recordCounts } from "@/server/list-types-store";
import { RecordsTable } from "./RecordsTable";

export const dynamic = "force-dynamic";

/** The records of a list type: pick the type, then add and edit its records (each supplier, each work place…). */
export default async function RecordsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type: typeId } = await searchParams;
  const [types, dict, counts] = await Promise.all([listListTypes(), listDictionary(), recordCounts()]);
  const type = types.find((t) => t.id === typeId) ?? types[0];
  const byKey = new Map(dict.map((f) => [f.key, f]));
  const fields = type ? type.fields.flatMap((k) => (byKey.has(k) ? [{ key: k, label: byKey.get(k)!.label, type: byKey.get(k)!.type }] : [])) : [];
  const rows = type ? await listRecordsOf(type.id) : [];

  return (
    <main className="space-y-5 px-4 py-6 lg:px-8">
      <PageHeader title="רשומות" description="בוחרים סוג רשימה וממלאים את הפרטים של כל ספק, מקום עבודה וכו׳. בטופס בוחרים רשומה, והשדות שלה מתמלאים אוטומטית." />
      {types.length === 0 ? (
        <p className="text-sm text-muted-foreground">עדיין אין סוגי רשימות. צרו אחד בלשונית <Link href="/admin/fields/types" className="underline">סוגי רשימות</Link>.</p>
      ) : (
        <>
          <nav aria-label="סוג רשימה" className="flex flex-wrap gap-2">
            {types.map((t) => (
              <Link
                key={t.id}
                href={`/admin/fields/records?type=${t.id}`}
                aria-current={t.id === type!.id ? "page" : undefined}
                className={cn("inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm", t.id === type!.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
              >
                {t.name}
                <span className={cn("rounded-full px-1.5 text-xs tabular-nums", t.id === type!.id ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground")}>{counts.get(t.id) ?? 0}</span>
              </Link>
            ))}
          </nav>
          <RecordsTable key={type!.id} typeId={type!.id} typeName={type!.name} fields={fields} displayKey={type!.displayKey} rows={rows.map((r) => ({ id: r.id, values: r.values }))} />
        </>
      )}
    </main>
  );
}
