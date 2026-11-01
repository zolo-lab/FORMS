/**
 * The form's own link (/f/<form id>, like iForms): whoever opens it fills the form's first step, and a request is
 * created that goes on through the rest of the steps. Only a first step that the person opening the link can be
 * makes sense: the sender (they fill the sender's fields) or the employee (they are the employee).
 */
import type { StepRole } from "@/lib/workflow/types";

export const publicFillPath = (formId: string) => `/f/${formId}`;

export type PublicStart = { ok: true; role: "requester" | "employee" } | { ok: false; reason: "no_steps" | "first_step_is_someone" };

export function publicStart(steps: { role: StepRole }[]): PublicStart {
  const first = steps[0];
  if (!first) return { ok: false, reason: "no_steps" };
  if (first.role === "requester" || first.role === "employee") return { ok: true, role: first.role };
  return { ok: false, reason: "first_step_is_someone" };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The person opening the link: a name and an e-mail are required (the next steps and their copy go there). */
export function parseFiller(input: { name?: string; email?: string; phone?: string }): { ok: true; name: string; email: string; phone?: string } | { ok: false; error: "name" | "email" } {
  const name = (input.name ?? "").trim().slice(0, 120);
  const email = (input.email ?? "").trim().toLowerCase().slice(0, 200);
  const phone = (input.phone ?? "").trim().slice(0, 30) || undefined;
  if (!name) return { ok: false, error: "name" };
  if (!EMAIL.test(email)) return { ok: false, error: "email" };
  return { ok: true, name, email, ...(phone ? { phone } : {}) };
}
