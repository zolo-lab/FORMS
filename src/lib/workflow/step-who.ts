/**
 * The minimal step editor ("שלבי הטופס", like iForms): one "who" choice per step. Role, action and assignee kind
 * follow from it, so the admin never picks them separately.
 */
import type { AssigneeKind, StepActionKind, StepRole, WorkflowStep } from "./types";
import { assigneeKindOf } from "./assignee";

export const STEP_WHO = ["requester", "employee", "contact", "group_all", "email", "from_field"] as const;
export type StepWho = (typeof STEP_WHO)[number];

export const STEP_WHO_LABELS: Record<StepWho, string> = {
  requester: "השולח (ממלא את הטופס ושולח)",
  employee: "העובד (מי שהטופס נשלח אליו)",
  contact: "משתמש מוגדר",
  group_all: "קבוצה (כולם במקביל)",
  email: "מייל קבוע (למשל גורם חיצוני)",
  from_field: "המייל שמולא בשדה של שלב קודם",
};

/**
 * Roles of the steps that go to a chosen person. The role only ties fields to their step ("באיזה שלב השדה מופיע"), so
 * every such step gets its own, automatically: the admin never picks it. payroll/hr are kept for older forms.
 */
export const APPROVER_ROLES = ["approver", "approver2", "approver3", "approver4", "approver5", "approver6"] as const satisfies readonly StepRole[];
export const PERSON_ROLES = [...APPROVER_ROLES, "payroll", "hr"] as const satisfies readonly StepRole[];
const isPersonRole = (r: string) => (PERSON_ROLES as readonly string[]).includes(r);
const isPersonWho = (w: StepWho) => w !== "requester" && w !== "employee";

/** The first approval role no other step uses (the last one when all are taken). */
export function freePersonRole(used: StepRole[]): StepRole {
  return APPROVER_ROLES.find((r) => !used.includes(r)) ?? "approver6";
}

/**
 * Gives every step that goes to a person its own role (the role ties the fields to the step). A step keeps its role
 * while it is valid and not taken by an earlier step; otherwise it gets one that no step uses and no field still
 * holds (`reserved`: roles of fields left without a step, so a new step does not silently take them over).
 * The sender and the employee have fixed roles.
 */
export function assignRoles<T extends { who: StepWho; role: StepRole }>(drafts: T[], reserved: StepRole[] = []): T[] {
  const fixedRole = (d: T): StepRole | null => (d.who === "requester" ? "requester" : d.who === "employee" ? "employee" : null);
  const taken: StepRole[] = [...reserved, ...drafts.filter((d) => isPersonWho(d.who) && isPersonRole(d.role)).map((d) => d.role)];
  const used: StepRole[] = [];
  return drafts.map((d) => {
    const fixed = fixedRole(d);
    if (fixed) return d.role === fixed ? d : { ...d, role: fixed };
    const keep = isPersonRole(d.role) && !used.includes(d.role) && !reserved.includes(d.role);
    const role = keep ? d.role : freePersonRole([...taken, ...used]);
    used.push(role);
    return role === d.role ? d : { ...d, role };
  });
}

export function stepWhoOf(step: Pick<WorkflowStep, "role" | "assigneeKind" | "assigneeFromFieldId" | "contactId">): StepWho {
  if (step.role === "requester") return "requester";
  if (step.role === "employee") return "employee";
  const kind = assigneeKindOf(step);
  if (kind === "fixed") return "email";
  return kind === "group_all" || kind === "from_field" ? kind : "contact";
}

/** The hidden values the step form submits for a "who" choice (`role` only matters for a chosen person). */
export function stepFields(who: StepWho, role: StepRole): { role: StepRole; action: StepActionKind; assigneeKind?: AssigneeKind } {
  if (who === "requester") return { role: "requester", action: "fill" };
  if (who === "employee") return { role: "employee", action: "fill_and_sign" };
  const r = isPersonRole(role) ? role : "approver";
  return { role: r, action: "approve", assigneeKind: who === "email" ? "fixed" : who };
}

/** What the steps editor holds for one step: the "who" choice and the one detail it needs. */
export interface StepDraft {
  who: StepWho;
  role: StepRole;
  contactId?: string;
  groupId?: string;
  fieldId?: string;
  email?: string;
  name?: string;
  formOnly?: boolean;
  /** Kept as they were (not edited in this screen). */
  dueHours?: number;
  otpRequired?: boolean;
  skipIf?: WorkflowStep["skipIf"];
}

export function draftOf(step: WorkflowStep): StepDraft {
  const who = stepWhoOf(step);
  return {
    who,
    role: step.role,
    ...(step.contactId ? { contactId: step.contactId } : {}),
    ...(step.groupId ? { groupId: step.groupId } : {}),
    ...(step.assigneeFromFieldId ? { fieldId: step.assigneeFromFieldId } : {}),
    ...(who === "email" && step.assignee?.email ? { email: step.assignee.email } : {}),
    ...(who === "email" && step.assignee?.name && step.assignee.name !== step.assignee.email ? { name: step.assignee.name } : {}),
    ...(step.formOnly ? { formOnly: true } : {}),
    ...(step.dueHours ? { dueHours: step.dueHours } : {}),
    ...(step.otpRequired ? { otpRequired: true } : {}),
    ...(step.skipIf ? { skipIf: step.skipIf } : {}),
  };
}

/** The stored step for a draft at position `index` (steps run one after the other). */
export function stepFromDraft(d: StepDraft, index: number): WorkflowStep {
  const who: StepWho = (STEP_WHO as readonly string[]).includes(d.who) ? d.who : "employee";
  const f = stepFields(who, d.role);
  const email = d.email?.trim() ?? "";
  return {
    order: index + 1,
    role: f.role,
    action: f.action,
    ...(f.assigneeKind ? { assigneeKind: f.assigneeKind } : {}),
    ...(who === "contact" && d.contactId ? { contactId: d.contactId } : {}),
    ...(who === "group_all" && d.groupId ? { groupId: d.groupId } : {}),
    ...(who === "from_field" && d.fieldId ? { assigneeFromFieldId: d.fieldId } : {}),
    ...(who === "email" ? { assignee: { name: d.name?.trim() || email, ...(email ? { email } : {}) }, otpRequired: true } : d.otpRequired ? { otpRequired: true } : {}),
    ...(d.formOnly && who !== "requester" ? { formOnly: true } : {}),
    ...(d.dueHours && Number.isInteger(d.dueHours) && d.dueHours > 0 ? { dueHours: d.dueHours } : {}),
    ...(d.skipIf && typeof d.skipIf === "object" ? { skipIf: d.skipIf } : {}),
  };
}

/** A draft as sent by the browser: keep only known keys of the right type. */
export function sanitizeDraft(x: unknown): StepDraft {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const s = (k: string, max = 200) => (typeof o[k] === "string" && o[k] ? (o[k] as string).slice(0, max) : undefined);
  const who = (STEP_WHO as readonly string[]).includes(String(o.who)) ? (o.who as StepWho) : "employee";
  const role = (["requester", "employee", ...PERSON_ROLES] as string[]).includes(String(o.role)) ? (o.role as StepRole) : "approver";
  return {
    who,
    role,
    contactId: s("contactId", 40),
    groupId: s("groupId", 40),
    fieldId: s("fieldId", 80),
    email: s("email", 200),
    name: s("name", 120),
    formOnly: o.formOnly === true,
    dueHours: typeof o.dueHours === "number" ? o.dueHours : undefined,
    otpRequired: o.otpRequired === true,
    skipIf: o.skipIf && typeof o.skipIf === "object" ? (o.skipIf as StepDraft["skipIf"]) : undefined,
  };
}
