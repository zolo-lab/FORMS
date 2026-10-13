/** Pure checks for a package workflow, shown in the package editor and enforced when a request is created. */
import { STEP_ACTIONS, type StepRole, type Workflow, type WorkflowStep } from "./types";
import { ROLE_LABELS } from "./labels";
import { normalizeIsraeliPhone } from "@/lib/whatsapp";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Roles whose person is known from the request itself (the requester is logged in, the employee is the subject). */
const IMPLICIT: StepRole[] = ["requester", "employee"];

export function validateWorkflow(w: Workflow): string[] {
  const errors: string[] = [];
  if (w.steps.length === 0) return ["אין שלבים במסלול"];
  w.steps.forEach((s, i) => {
    const name = `שלב ${i + 1} (${ROLE_LABELS[s.role] ?? s.role})`;
    if (!Number.isInteger(s.order) || s.order < 1) errors.push(`${name}: מספר סדר חייב להיות מספר שלם חיובי`);
    if (!(s.role in ROLE_LABELS)) errors.push(`${name}: תפקיד לא מוכר`);
    if (!STEP_ACTIONS.includes(s.action)) errors.push(`${name}: פעולה לא מוכרת`);
    if (s.dueHours !== undefined && (!Number.isInteger(s.dueHours) || s.dueHours < 1)) errors.push(`${name}: יעד זמן חייב להיות מספר שעות שלם`);
    const a = s.assignee;
    if (a?.email && !EMAIL.test(a.email)) errors.push(`${name}: כתובת מייל לא תקינה`);
    if (a?.phone && !normalizeIsraeliPhone(a.phone)) errors.push(`${name}: מספר טלפון לא תקין`);
    if (!IMPLICIT.includes(s.role) && !s.assigneeFromFieldId && !a?.name?.trim()) {
      errors.push(`${name}: נדרש שם לנמען הקבוע (או שדה שממנו נלקח הנמען). בלי מייל/טלפון הקישור יימסר ידנית`);
    }
    if (s.otpRequired && !IMPLICIT.includes(s.role) && !a?.email && !s.assigneeFromFieldId) errors.push(`${name}: אימות בקוד נשלח במייל, הגדירו מייל לנמען`);
  });
  return errors;
}

/** Renumbers `order` to 1..n keeping equal orders equal (parallel steps) and the relative sequence. */
export function normalizeOrders(steps: WorkflowStep[]): WorkflowStep[] {
  const distinct = [...new Set(steps.map((s) => s.order))].sort((a, b) => a - b);
  const map = new Map(distinct.map((o, i) => [o, i + 1]));
  return [...steps].sort((a, b) => a.order - b.order).map((s) => ({ ...s, order: map.get(s.order)! }));
}
