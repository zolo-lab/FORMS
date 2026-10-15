/** FormData ↔ WorkflowStep for the package editor. Pure, so it can be unit tested. */
import { ASSIGNEE_KINDS, STEP_ACTIONS, type AssigneeKind, type StepActionKind, type StepRole, type WorkflowStep } from "./types";
import { ROLE_LABELS } from "./labels";

type Getter = { get(name: string): FormDataEntryValue | null };
const str = (g: Getter, k: string) => String(g.get(k) ?? "").trim();

export function parseStepForm(g: Getter): WorkflowStep {
  const role = str(g, "role") as StepRole;
  const action = str(g, "action") as StepActionKind;
  const order = Number(str(g, "order"));
  const name = str(g, "assigneeName");
  const email = str(g, "assigneeEmail");
  const phone = str(g, "assigneePhone");
  const due = str(g, "dueHours");
  const fromField = str(g, "assigneeFromFieldId");
  const kindRaw = str(g, "assigneeKind");
  const kind: AssigneeKind | undefined = (ASSIGNEE_KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as AssigneeKind) : undefined;
  const contactId = str(g, "contactId");
  const groupId = str(g, "groupId");
  return {
    order: Number.isFinite(order) ? Math.trunc(order) : 0,
    role: (role in ROLE_LABELS ? role : "employee") as StepRole,
    action: (STEP_ACTIONS as readonly string[]).includes(action) ? action : "fill",
    ...(g.get("otpRequired") === "on" || g.get("otpRequired") === "1" ? { otpRequired: true } : {}),
    ...(kind ? { assigneeKind: kind } : {}),
    ...(kind === "contact" && contactId ? { contactId } : {}),
    ...(kind === "group_all" && groupId ? { groupId } : {}),
    ...(fromField && (!kind || kind === "from_field") ? { assigneeFromFieldId: fromField } : {}),
    ...(due ? { dueHours: Number(due) } : {}),
    ...(name || email || phone ? { assignee: { name, ...(email ? { email } : {}), ...(phone ? { phone } : {}) } } : {}),
  };
}
