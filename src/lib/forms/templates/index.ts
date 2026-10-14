/** Built-in starting points for "טופס חדש מתבנית". Each is a full FormDefinition checked by a test. */
import type { FormDefinition } from "../schema";
import intake from "./intake-employee.json";
import termination from "./termination.json";

export interface FormTemplateEntry {
  id: string;
  name: string;
  description: string;
  definition: FormDefinition;
}

export const FORM_TEMPLATES: FormTemplateEntry[] = [
  { id: "intake-employee", name: "קליטת עובד", description: "פרטי העסקה (ממלא המבקש), פרטים אישיים וחשבון בנק (ממלא העובד), הצהרה וחתימה.", definition: intake as FormDefinition },
  { id: "termination", name: "סיום העסקה", description: "פרטי הסיום (ממלא המבקש), אישור העובד על החזרת ציוד וחתימה.", definition: termination as FormDefinition },
];

export function findTemplate(id: string): FormTemplateEntry | undefined {
  return FORM_TEMPLATES.find((t) => t.id === id);
}
