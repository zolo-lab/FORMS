import { FIELD_CATEGORY_LABELS, FIELD_TYPE_META, fieldTypesByCategory } from "@/lib/forms/field-types";

export default function Home() {
  const groups = fieldTypesByCategory();
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">מערכת טפסים וחתימות</h1>
      <p className="mt-2 text-muted-foreground">שלד המערכת עלה. סוגי השדות הנתמכים במנוע הטפסים:</p>
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {Object.entries(groups).map(([cat, types]) => (
          <section key={cat} className="rounded-lg border bg-card p-4">
            <h2 className="font-semibold">{FIELD_CATEGORY_LABELS[cat as keyof typeof FIELD_CATEGORY_LABELS]}</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {types.map((t) => (
                <li key={t} className="rounded-md bg-secondary px-2 py-1 text-sm">
                  {FIELD_TYPE_META[t].label}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
