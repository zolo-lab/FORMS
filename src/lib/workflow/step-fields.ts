/** Fields of a form seen from the steps: which can say where a step is sent, and how each step is named. */
import { allFields, type FormDefinition } from "@/lib/forms/schema";
import { groupIdOfSource } from "./assignee";
import { ROLE_LABELS } from "./labels";
import { stepChoices, type StepChoice } from "./step-who";
import type { StepRole, WorkflowStep } from "./types";

/** Email fields and group lists: a step can be sent to the address typed (or the member picked) in one of them. */
export function emailFieldsOf(def: FormDefinition): { id: string; label: string; role: StepRole }[] {
  return allFields(def)
    .filter((f) => f.type === "email" || (f.type === "dropdown" && groupIdOfSource(f.optionsSource)))
    .map((f) => ({ id: f.id, label: f.type === "email" ? f.label || f.id : `${f.label || f.id} (בחירה מקבוצה)`, role: f.filledBy ?? "employee" }));
}

/** One option per step ("שלב 2 · העובד"), for picking a step's fields. */
export function stepOptions(steps: Pick<WorkflowStep, "role" | "assigneeKind" | "assigneeFromFieldId" | "contactId">[]): StepChoice[] {
  return stepChoices(steps, ROLE_LABELS);
}
