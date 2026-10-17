/**
 * Shared workflow types: used by the DB schema (jsonb columns), the engine and the UI.
 * Pure types only — no runtime imports, so schema.ts can import this safely.
 */
import type { Condition, FillerRole } from "@/lib/forms/schema";

export type StepRole = FillerRole;

export const STEP_ACTIONS = ["fill", "sign", "approve", "fill_and_sign", "view"] as const;
export type StepActionKind = (typeof STEP_ACTIONS)[number];

export const STEP_STATUSES = [
  "pending",
  "active",
  "in_progress",
  "completed",
  "declined",
  "returned",
  "skipped",
  "expired",
  "cancelled",
  "delegated",
] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const REQUEST_STATUSES = [
  "draft",
  "in_progress",
  "returned",
  "completed",
  "declined",
  "cancelled",
  "expired",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/**
 * How the person of a step is chosen (the signer types of iForms Flow):
 *  - fixed: `assignee` (name/email/phone typed in the package)
 *  - contact: one saved contact (`contactId`)
 *  - from_field: the answer of `assigneeFromFieldId` – free text (email/phone) or, when the field lists a group
 *    (`optionsSource: "group:<id>"`), the contact chosen there
 *  - group_all: every member of `groupId`, as parallel steps
 *  - requester: whoever opened the request (e.g. the final approval comes back to them)
 *  - implicit (requester/employee): the person is known from the request itself
 */
export const ASSIGNEE_KINDS = ["fixed", "contact", "from_field", "group_all", "requester"] as const;
export type AssigneeKind = (typeof ASSIGNEE_KINDS)[number];

/** A person a step can go to (a contact row, or someone typed by hand). */
export interface Person {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
}

/** Saved people the engine needs to plan a workflow (looked up by the server before planning). */
export interface PeopleDirectory {
  /** The signed-in user who opened the request (for `assigneeKind: "requester"`). */
  requester?: Person;
  contacts?: Record<string, Person>;
  groups?: Record<string, Person[]>;
}

/** One step in a package workflow. Same `order` = parallel steps. */
export interface WorkflowStep {
  order: number;
  role: StepRole;
  action: StepActionKind;
  otpRequired?: boolean;
  /** Missing = "from_field" when `assigneeFromFieldId` is set, otherwise "fixed" (older packages). */
  assigneeKind?: AssigneeKind;
  contactId?: string;
  groupId?: string;
  /** Take the assignee (name/email/phone) from this answer instead of a fixed person. */
  assigneeFromFieldId?: string;
  /** Skip the step when this condition holds on the answers collected so far. */
  skipIf?: Condition;
  dueHours?: number;
  /** Fixed assignee, when the step is always the same person (e.g. payroll). */
  assignee?: { name: string; email?: string; phone?: string };
}

export interface Workflow {
  steps: WorkflowStep[];
}

export interface ReminderPolicy {
  /** Hours after activation to send the first reminder. */
  firstAfterHours: number;
  /** Hours between later reminders. */
  everyHours: number;
  maxCount: number;
  /** No sending between these hours (Asia/Jerusalem, 24h clock). */
  quietFromHour: number;
  quietToHour: number;
  skipShabbat: boolean;
}

export const DEFAULT_REMINDER_POLICY: ReminderPolicy = {
  firstAfterHours: 24,
  everyHours: 48,
  maxCount: 3,
  quietFromHour: 21,
  quietToHour: 8,
  skipShabbat: true,
};
