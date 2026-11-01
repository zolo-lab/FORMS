/**
 * The form's steps as seen from its fields: one name per step used everywhere ("שלב 3 · דנה כהן"), which step each
 * field is in, which fields are in no step, and which fields can say where a step is sent.
 */
import { FIELD_TYPE_META } from "@/lib/forms/field-types";
import { allFields, type FillerRole, type FormDefinition, type FormField } from "@/lib/forms/schema";
import { groupIdOfSource } from "./assignee";
import { stepWhoOf, type StepWho } from "./step-who";
import type { StepRole, WorkflowStep } from "./types";

type Option = { id: string; label: string };
export interface StepNameContext { contacts?: Option[]; groups?: Option[]; fields?: Option[] }

/** What a step needs to be named: its "who" and the one detail that says who exactly. */
export interface NamedStep {
  who: StepWho;
  role: StepRole;
  contactId?: string;
  groupId?: string;
  fieldId?: string;
  email?: string;
  name?: string;
}

export interface StepView { index: number; role: StepRole; label: string }

const nameOf = (label: string) => label.split(" · ")[0]!.replace(/ \(\d+\)$/, "");

/** Who the step goes to, in a few words: "השולח", "העובד", "דנה כהן", "קבוצה: שכר", "payroll@…", "המייל מ'מייל מנהל'". */
export function stepTarget(s: NamedStep, ctx: StepNameContext = {}): string {
  switch (s.who) {
    case "requester": return "השולח";
    case "employee": return "העובד";
    case "contact": {
      const c = ctx.contacts?.find((x) => x.id === s.contactId);
      return c ? nameOf(c.label) : "משתמש (לא נבחר)";
    }
    case "group_all": {
      const g = ctx.groups?.find((x) => x.id === s.groupId);
      return g ? `קבוצה: ${nameOf(g.label)}` : "קבוצה (לא נבחרה)";
    }
    case "email": return s.name?.trim() || s.email?.trim() || "מייל (לא הוזן)";
    case "from_field": {
      const f = ctx.fields?.find((x) => x.id === s.fieldId);
      return f ? `המייל מ"${f.label}"` : "מייל משדה (לא נבחר)";
    }
  }
}

export const stepLabel = (s: NamedStep, index: number, ctx: StepNameContext = {}) => `שלב ${index + 1} · ${stepTarget(s, ctx)}`;

/** The steps of a form with their names, in order. */
export function stepViews(steps: NamedStep[], ctx: StepNameContext = {}): StepView[] {
  return steps.map((s, i) => ({ index: i, role: s.role, label: stepLabel(s, i, ctx) }));
}

/** A stored step as a NamedStep (for places that only have the saved workflow). */
export function namedStep(w: WorkflowStep): NamedStep {
  const who = stepWhoOf(w);
  return { who, role: w.role, contactId: w.contactId, groupId: w.groupId, fieldId: w.assigneeFromFieldId, email: w.assignee?.email, name: w.assignee?.name };
}

/** The step a field is in. A field never assigned belongs to the employee (the runtime rule), if the form has one. */
export const fieldRole = (f: Pick<FormField, "filledBy">): FillerRole => f.filledBy ?? "employee";

/** Fields that someone answers. */
export const answerFields = (def: FormDefinition) => allFields(def).filter((f) => FIELD_TYPE_META[f.type].hasAnswer && f.type !== "hidden");

/** Fields that are in no step of the form: nobody would see or fill them. */
export function unassignedFields(def: FormDefinition, roles: StepRole[]): FormField[] {
  const have = new Set(roles);
  return answerFields(def).filter((f) => !have.has(fieldRole(f)));
}

/** Email fields and group lists: a step can be sent to the address typed (or the member picked) in one of them. */
export function emailFieldsOf(def: FormDefinition): { id: string; label: string; role: StepRole }[] {
  return allFields(def)
    .filter((f) => f.type === "email" || (f.type === "dropdown" && groupIdOfSource(f.optionsSource)))
    .map((f) => ({ id: f.id, label: f.type === "email" ? f.label || f.id : `${f.label || f.id} (בחירה מקבוצה)`, role: fieldRole(f) }));
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * What is still missing in each step, in the words of the steps editor (one list per step, empty when it is fine).
 * Used live in the editor and again by the server before saving.
 */
export function draftProblems(
  drafts: (NamedStep & { role: StepRole })[],
  emailFields: { id: string; label: string; role: StepRole }[],
): string[][] {
  const stepOfRole = (r: StepRole) => drafts.findIndex((d) => d.role === r);
  return drafts.map((d, i) => {
    const out: string[] = [];
    if (i === 0 && d.who !== "requester") out.push("שלב 1 הוא תמיד השולח");
    if (i > 0 && d.who === "requester") out.push("השולח יכול להיות רק שלב 1");
    if (d.who === "employee") {
      const first = drafts.findIndex((x) => x.who === "employee");
      if (first !== i) out.push(`העובד כבר מופיע בשלב ${first + 1}`);
    }
    if (d.who === "contact" && !d.contactId) out.push("בחרו משתמש");
    if (d.who === "group_all" && !d.groupId) out.push("בחרו קבוצה");
    if (d.who === "email") {
      if (!d.email?.trim()) out.push("הזינו מייל");
      else if (!EMAIL.test(d.email.trim())) out.push("המייל לא תקין");
    }
    if (d.who === "from_field") {
      const f = emailFields.find((x) => x.id === d.fieldId);
      if (!d.fieldId) out.push("בחרו שדה מייל");
      else if (!f) out.push("השדה שנבחר כבר לא קיים בטופס (נמחק או ששמו שונה) – בחרו שוב");
      else {
        const at = stepOfRole(f.role);
        if (at < 0 || at >= i) out.push(at < 0 ? `השדה "${f.label}" לא משויך לאף שלב – שייכו אותו לשלב שלפני השלב הזה` : `השדה "${f.label}" ממולא בשלב ${at + 1}. צריך שדה משלב קודם`);
      }
    }
    return out;
  });
}

/** The email field a "by field" step should use when none is chosen yet: the last one filled before it. */
export function defaultEmailField(drafts: { role: StepRole }[], index: number, emailFields: { id: string; role: StepRole }[]): string | undefined {
  const earlier = drafts.slice(0, index).map((d) => d.role);
  return [...emailFields].reverse().find((f) => earlier.includes(f.role))?.id;
}
