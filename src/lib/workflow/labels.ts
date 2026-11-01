import type { StepRole } from "./types";

export const ROLE_LABELS: Record<StepRole, string> = {
  requester: "מבקש",
  employee: "עובד",
  approver: "מאשר",
  payroll: "חשבות שכר",
  hr: "משאבי אנוש",
  approver2: "מאשר 2",
  approver3: "מאשר 3",
  approver4: "מאשר 4",
  approver5: "מאשר 5",
  approver6: "מאשר 6",
  unassigned: "לא משויך לשלב",
};

export const REQUEST_STATUS_LABEL = {
  draft: ["טיוטה", "muted"],
  in_progress: ["בתהליך", "warning"],
  returned: ["הוחזר", "warning"],
  completed: ["הושלם", "success"],
  declined: ["נדחה", "muted"],
  cancelled: ["בוטל", "muted"],
  expired: ["פג תוקף", "muted"],
} as const;

export const STEP_STATUS_LABEL: Record<string, string> = {
  pending: "ממתין",
  active: "פעיל",
  in_progress: "בטיפול",
  completed: "הושלם",
  declined: "נדחה",
  returned: "הוחזר",
  skipped: "דולג",
  expired: "פג תוקף",
  cancelled: "בוטל",
  delegated: "הואצל",
};

/** A step of a sent request, named the same way as in the form editor: "שלב 3 · דנה כהן". */
export function runStepLabel(s: { order: number; role: string; assigneeName?: string | null }): string {
  const who = s.role === "requester" ? "השולח" : s.role === "employee" ? (s.assigneeName ? `העובד – ${s.assigneeName}` : "העובד") : s.assigneeName || "מאשר";
  return `שלב ${s.order} · ${who}`;
}
