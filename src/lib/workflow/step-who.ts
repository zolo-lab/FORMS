/**
 * The minimal step editor ("שלבי הטופס", like iForms): one "who" choice per step. Role, action and assignee kind
 * follow from it, so the admin never picks them separately.
 */
import type { AssigneeKind, StepActionKind, StepRole, WorkflowStep } from "./types";
import { assigneeKindOf } from "./assignee";

export const STEP_WHO = ["requester", "employee", "contact", "group_all", "from_field"] as const;
export type StepWho = (typeof STEP_WHO)[number];

export const STEP_WHO_LABELS: Record<StepWho, string> = {
  requester: "מי ששולח את הטופס",
  employee: "העובד",
  contact: "איש קשר קבוע",
  group_all: "כל חברי קבוצה (במקביל)",
  from_field: "מי שנבחר בטופס",
};

/** Roles a chosen person can have; the role decides which fields of the form are theirs. */
export const PERSON_ROLES = ["approver", "payroll", "hr"] as const satisfies readonly StepRole[];

export function stepWhoOf(step: Pick<WorkflowStep, "role" | "assigneeKind" | "assigneeFromFieldId">): StepWho {
  if (step.role === "requester") return "requester";
  if (step.role === "employee") return "employee";
  const kind = assigneeKindOf(step);
  return kind === "group_all" || kind === "from_field" ? kind : "contact";
}

/** The hidden values the step form submits for a "who" choice (`role` only matters for a chosen person). */
export function stepFields(who: StepWho, role: StepRole): { role: StepRole; action: StepActionKind; assigneeKind?: AssigneeKind } {
  if (who === "requester") return { role: "requester", action: "fill" };
  if (who === "employee") return { role: "employee", action: "fill_and_sign" };
  const r = (PERSON_ROLES as readonly StepRole[]).includes(role) ? role : "approver";
  return { role: r, action: "approve", assigneeKind: who };
}
