import type { StepRole } from "./types";

export const ROLE_LABELS: Record<StepRole, string> = {
  requester: "מבקש",
  employee: "עובד",
  approver: "מאשר",
  payroll: "חשבות שכר",
  hr: "משאבי אנוש",
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
