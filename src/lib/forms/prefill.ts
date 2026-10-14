/** Initial values for fields with `prefill`, taken from the request's subject (the employee the request is about). */
import type { Answers } from "./conditions";
import { allFields, type FormDefinition } from "./schema";

export interface PrefillSubject {
  name: string;
  idNumber?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** Data a field can be pre-filled from (the request's employee). Shown as a list in the builder. */
export const PREFILL_KEYS = [
  { key: "employee.name", label: "שם מלא של העובד" },
  { key: "employee.firstName", label: "שם פרטי של העובד" },
  { key: "employee.lastName", label: "שם משפחה של העובד" },
  { key: "employee.idNumber", label: "מספר זהות של העובד" },
  { key: "employee.email", label: "מייל של העובד" },
  { key: "employee.phone", label: "טלפון של העובד" },
] as const;

/** Splits "ישראל בן דוד" into first "ישראל" and last "בן דוד". */
function splitName(name: string): { first: string; last: string } {
  const [first = "", ...rest] = name.trim().split(/\s+/);
  return { first, last: rest.join(" ") };
}

function valueFor(key: string, type: string, s: PrefillSubject): unknown {
  switch (key) {
    case "employee.name":
      return type === "full_name" ? splitName(s.name) : s.name.trim() || undefined;
    case "employee.firstName":
      return splitName(s.name).first || undefined;
    case "employee.lastName":
      return splitName(s.name).last || undefined;
    case "employee.idNumber":
      return s.idNumber?.trim() || undefined;
    case "employee.email":
      return s.email?.trim() || undefined;
    case "employee.phone":
      return s.phone?.trim() || undefined;
    default:
      return undefined;
  }
}

/** Stored answers win; a prefill only fills fields that have no answer yet. */
export function withPrefill(def: FormDefinition, subject: PrefillSubject, answers: Answers): Answers {
  const out: Answers = { ...answers };
  for (const f of allFields(def)) {
    if (!f.prefill || out[f.id] !== undefined) continue;
    const v = valueFor(f.prefill, f.type, subject);
    if (v !== undefined) out[f.id] = v as Answers[string];
  }
  return out;
}
