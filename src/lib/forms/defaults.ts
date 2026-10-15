/**
 * Default values of fields ("ערך ברירת מחדל" in iForms).
 *
 * - A field with `defaultValue` starts with that value when it has no answer yet.
 * - A date field whose default is "today" starts with the current date.
 * - A read-only field with a default always holds the default ("ברירת המחדל לקריאה בלבד"): whatever the client
 *   sends is replaced, so the server stores the value the form designer set.
 */
import type { Answers } from "./conditions";
import { allFields, type FormDefinition, type FormField } from "./schema";

/** The special default of a date field that means "the date the form is filled". */
export const TODAY = "today";

/** The value a field's default stands for on `today` (yyyy-mm-dd), or undefined when it has none. */
export function resolveDefault(field: FormField, today: string): unknown {
  const d = field.defaultValue;
  if (d === undefined || d === null || d === "") return undefined;
  if (field.type === "date" && d === TODAY) return today;
  return d;
}

/** Answers with defaults filled in: blank answers get the default, read-only fields always hold it. */
export function withDefaults(def: FormDefinition, answers: Answers, today: string): Answers {
  let out: Answers | null = null;
  for (const f of allFields(def)) {
    const v = resolveDefault(f, today);
    if (v === undefined) continue;
    const cur = answers[f.id];
    if (f.readOnly ? cur !== v : cur === undefined) {
      out ??= { ...answers };
      out[f.id] = v as Answers[string];
    }
  }
  return out ?? answers;
}
