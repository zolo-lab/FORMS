/** Pure helpers around who a step goes to (see `AssigneeKind` in types.ts). */
import type { AssigneeKind, WorkflowStep } from "./types";

/** Older packages have no `assigneeKind`: a field id means "from_field", anything else "fixed". */
export function assigneeKindOf(step: Pick<WorkflowStep, "assigneeKind" | "assigneeFromFieldId">): AssigneeKind {
  if (step.assigneeKind) return step.assigneeKind;
  return step.assigneeFromFieldId ? "from_field" : "fixed";
}

export const ASSIGNEE_KIND_LABELS: Record<AssigneeKind, string> = {
  fixed: "נמען קבוע (שם, מייל, טלפון)",
  contact: "איש קשר שמור",
  from_field: "לפי שדה בטופס (בחירה מקבוצה, או מייל/טלפון שהוקלד)",
  group_all: "כל חברי קבוצה, במקביל",
  requester: "מי שפתח את הבקשה",
};

/** The `optionsSource` key that lists a group's members in a dropdown. */
export const GROUP_SOURCE_PREFIX = "group:";

export function groupIdOfSource(optionsSource: string | undefined): string | null {
  return optionsSource?.startsWith(GROUP_SOURCE_PREFIX) ? optionsSource.slice(GROUP_SOURCE_PREFIX.length) : null;
}
