/**
 * The form's own link (/f/<form id>, like iForms): it opens the form itself on its first step's fields. Sending creates
 * a request that goes on through the rest of the steps. Only a first step that the person opening the link can be
 * makes sense: the sender or the employee.
 */
import type { Answers } from "./conditions";
import { allFields, type FormDefinition } from "./schema";
import type { StepRole } from "@/lib/workflow/types";

/** The form's link; with an organization's short name (slug), the link of that organization: /f/<form id>/pnima. */
export const publicFillPath = (formId: string, orgSlug?: string | null) => (orgSlug ? `/f/${formId}/${orgSlug}` : `/f/${formId}`);

export interface LinkOrg {
  id: string;
  name: string;
  slug: string | null;
  registrationNumber?: string;
}

/**
 * The organizations a form's link may be opened for: the ones ticked in the form's settings, else the one the form
 * belongs to, else every active organization. Inactive organizations never.
 */
export function allowedOrgs<T extends LinkOrg & { active: boolean }>(form: { organizationId: string | null; organizationIds?: string[] | null }, orgs: T[]): T[] {
  const active = orgs.filter((o) => o.active);
  const ticked = form.organizationIds?.length ? form.organizationIds : form.organizationId ? [form.organizationId] : null;
  return ticked ? active.filter((o) => ticked.includes(o.id)) : active;
}

export type LinkOrgResult<T> = { ok: true; org: T } | { ok: false; reason: "choose_org" | "org_not_allowed" | "no_organization" };

/**
 * The organization of one opening of the link: the one named in it (it must be allowed), or – on the link without one
 * – the only organization the form is open to. A form open to several organizations needs the organization's link.
 */
export function linkOrg<T extends LinkOrg>(allowed: T[], slug: string | null | undefined): LinkOrgResult<T> {
  if (slug) {
    const org = allowed.find((o) => o.slug === slug.toLowerCase());
    return org ? { ok: true, org } : { ok: false, reason: "org_not_allowed" };
  }
  if (allowed.length === 1) return { ok: true, org: allowed[0]! };
  return { ok: false, reason: allowed.length ? "choose_org" : "no_organization" };
}

export type PublicStart = { ok: true; role: "requester" | "employee" } | { ok: false; reason: "no_steps" | "first_step_is_someone" };

export function publicStart(steps: { role: StepRole }[]): PublicStart {
  const first = steps[0];
  if (!first) return { ok: false, reason: "no_steps" };
  if (first.role === "requester" || first.role === "employee") return { ok: true, role: first.role };
  return { ok: false, reason: "first_step_is_someone" };
}

/**
 * The step the link opens on: the first step, unless it is a sender with nothing to fill and the employee comes next –
 * then the employee's fields (as when the form is sent from the system, an empty sender step is passed at once).
 * null when there is nothing to fill at all.
 */
export function publicRole(steps: { role: StepRole }[], hasFields: (role: "requester" | "employee") => boolean): "requester" | "employee" | null {
  const start = publicStart(steps);
  if (!start.ok) return null;
  if (hasFields(start.role)) return start.role;
  if (start.role === "requester" && steps[1]?.role === "employee" && hasFields("employee")) return "employee";
  return null;
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
