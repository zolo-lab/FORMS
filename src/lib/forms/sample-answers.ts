/** Plausible sample answers per field type, used to preview a PDF mapping. */
import { FIELD_TYPE_META } from "./field-types";
import { allFields, type FormDefinition, type FormField } from "./schema";
import type { Answers } from "./conditions";

const TINY_SIGNATURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export function sampleValue(f: FormField): unknown {
  const opts = f.options ?? [];
  switch (f.type) {
    case "short_text": return `${f.label || "טקסט"} לדוגמה`;
    case "long_text": return "טקסט ארוך לדוגמה שנמשך על פני כמה שורות כדי לבדוק את גלישת השורות בתוך התיבה.";
    case "radio": case "dropdown": return opts[0]?.value ?? "";
    case "checkboxes": return opts.slice(0, 2).map((o) => o.value);
    case "yes_no": return "yes";
    case "number": return 1234;
    case "currency": return 8500;
    case "percent": return 50;
    case "linear_scale": return Number(f.settings?.max ?? 5);
    case "rating": return 4;
    case "email": return "israel@example.org";
    case "phone": return "050-1234567";
    case "id_number": return "000000018";
    case "date": return "1990-05-01";
    case "time": return "09:30";
    case "bank_account": return { bank: "10", branch: "912", account: "12345678" };
    case "address": return { city: "בית שאן", street: "הרצל", house: "12", apartment: "4", zip: "1090000" };
    case "consent": return true;
    case "signature": return { image: TINY_SIGNATURE };
    case "hidden": return "x";
    case "radio_grid": return Object.fromEntries(((f.settings?.rows as { value: string }[]) ?? []).map((r, i) => [r.value, ((f.settings?.columns as { value: string }[]) ?? [])[i % 2]?.value]));
    case "checkbox_grid": return Object.fromEntries(((f.settings?.rows as { value: string }[]) ?? []).map((r) => [r.value, [((f.settings?.columns as { value: string }[]) ?? [])[0]?.value]]));
    case "repeating_table": return [0, 1, 2].map(() => Object.fromEntries((f.fields ?? []).map((c) => [c.id, sampleValue(c)])));
    default: return undefined;
  }
}

export function sampleAnswersFor(def: FormDefinition): Answers {
  const out: Answers = {};
  for (const f of allFields(def)) if (FIELD_TYPE_META[f.type].hasAnswer) out[f.id] = sampleValue(f);
  return out;
}
