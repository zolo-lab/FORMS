"use client";
import { Select, Textarea } from "@/components/ui/input";
import { FIELD_TYPE_META } from "@/lib/forms/field-types";
import { parseFormula, formulaRefs } from "@/lib/forms/formula";
import { allFields, type FormDefinition, type FormField } from "@/lib/forms/schema";

const FUNCTION_HELP = [
  ["sum(…)", "סכום"],
  ["avg(…)", "ממוצע"],
  ["min(…) / max(…)", "מינימום / מקסימום"],
  ["count(…)", "כמה מולאו"],
  ["round(x, 2)", "עיגול"],
  ["age({תאריך})", "גיל בשנים"],
  ['if(תנאי, אם כן, אחרת)', "תנאי"],
  ["concat(…)", "חיבור טקסט"],
] as const;

/** Formula box for a computed field with a field picker and live syntax check. */
export function FormulaEditor({
  def,
  field,
  onChange,
}: {
  def: FormDefinition;
  field: FormField;
  onChange: (formula: string | undefined) => void;
}) {
  const value = field.formula ?? "";
  const parsed = value.trim() ? parseFormula(value) : null;
  const known = new Set(allFields(def).map((f) => f.id));
  const unknown = parsed?.ok ? formulaRefs(parsed.ast).filter((r) => !known.has(r)) : [];
  const error = parsed && !parsed.ok ? parsed.error : unknown.length ? `שדה לא קיים: ${unknown.join(", ")}` : null;

  // Pickable references: every answer field except this one; table columns as {table.column}.
  const refs: { ref: string; label: string }[] = [];
  for (const f of allFields(def)) {
    if (f.id === field.id || !FIELD_TYPE_META[f.type].hasAnswer) continue;
    if (f.type === "repeating_table") {
      for (const c of f.fields ?? []) refs.push({ ref: `${f.id}.${c.id}`, label: `${f.label || f.id} › ${c.label || c.id}` });
    } else {
      refs.push({ ref: f.id, label: f.label || f.id });
    }
  }

  return (
    <div className="space-y-2">
      <Textarea
        dir="ltr"
        rows={3}
        aria-label="נוסחה"
        aria-invalid={!!error}
        placeholder="{price} * {qty}"
        value={value}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="font-mono text-sm"
      />
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <Select
        aria-label="הוספת שדה לנוסחה"
        value=""
        onChange={(e) => {
          if (e.target.value) onChange(`${value}{${e.target.value}}`);
        }}
      >
        <option value="">הוספת שדה לנוסחה…</option>
        {refs.map((r) => <option key={r.ref} value={r.ref}>{r.label}</option>)}
      </Select>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">פונקציות ותחביר</summary>
        <ul className="mt-1 space-y-0.5">
          {FUNCTION_HELP.map(([f, d]) => <li key={f}><code dir="ltr">{f}</code> – {d}</li>)}
          <li>אופרטורים: <code dir="ltr">+ - * / % = != &lt; &gt; &amp;&amp; ||</code>. חלוקה באפס נותנת ריק.</li>
        </ul>
      </details>
    </div>
  );
}
