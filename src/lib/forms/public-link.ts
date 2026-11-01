/**
 * The form's own link (/f/<form id>, like iForms): it opens the form itself on its first step's fields. Sending creates
 * a request that goes on through the rest of the steps. Only a first step that the person opening the link can be
 * makes sense: the sender or the employee.
 */
import type { Answers } from "./conditions";
import { allFields, type FormDefinition } from "./schema";
import type { StepRole } from "@/lib/workflow/types";

export const publicFillPath = (formId: string) => `/f/${formId}`;

export type PublicStart = { ok: true; role: "requester" | "employee" } | { ok: false; reason: "no_steps" | "first_step_is_someone" };

export function publicStart(steps: { role: StepRole }[]): PublicStart {
  const first = steps[0];
  if (!first) return { ok: false, reason: "no_steps" };
  if (first.role === "requester" || first.role === "employee") return { ok: true, role: first.role };
  return { ok: false, reason: "first_step_is_someone" };
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Who the request is about, from what was filled on the link: the first e-mail / ID / phone answered, and a name from
 * the fields whose label says "שם" (first + last name when there are two). The employee step goes to that e-mail.
 */
export function subjectFromAnswers(def: FormDefinition, answers: Answers): { name: string; email?: string; idNumber?: string; phone?: string } {
  const fields = allFields(def);
  const first = (type: string) => fields.filter((f) => f.type === type).map((f) => text(answers[f.id])).find(Boolean);
  const email = first("email")?.toLowerCase();
  const idNumber = first("id_number");
  const phone = first("phone");
  const names = fields
    .filter((f) => f.type === "short_text" && /שם/.test(f.label) && !/(עמותה|ארגון|חברה|מעסיק|פרויקט|הורה|אב|אם)/.test(f.label))
    .map((f) => text(answers[f.id]))
    .filter(Boolean)
    .slice(0, 2);
  const name = names.join(" ") || email || idNumber || "";
  return { name, ...(email ? { email } : {}), ...(idNumber ? { idNumber } : {}), ...(phone ? { phone } : {}) };
}
