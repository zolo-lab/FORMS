/**
 * Signing-round state machine. Pure functions, no DB: every transition takes the
 * current steps and returns `{ steps, events }`; the store persists both.
 * Rules are documented in docs/build-plan-v3.md §3.
 */
import { evaluateCondition, type Answers } from "@/lib/forms/conditions";
import type { Condition } from "@/lib/forms/schema";
import { assigneeKindOf } from "./assignee";
import type { PeopleDirectory, Person, RequestStatus, StepActionKind, StepRole, StepStatus, Workflow, WorkflowStep } from "./types";

export interface EngineStep {
  id: string;
  order: number;
  role: StepRole;
  action: StepActionKind;
  status: StepStatus;
  otpRequired: boolean;
  skipIf?: Condition;
  assigneeFromFieldId?: string;
  assigneeName?: string;
  assigneeEmail?: string;
  assigneePhone?: string;
  delegatedFromStepId?: string;
  returnedToStepId?: string;
  declineReason?: string;
  returnReason?: string;
}

export interface EngineEvent {
  type: string;
  stepId?: string;
  payload?: Record<string, unknown>;
}

export interface EngineResult {
  steps: EngineStep[];
  events: EngineEvent[];
}

const DONE: StepStatus[] = ["completed", "skipped", "cancelled", "delegated"];
const OPEN: StepStatus[] = ["pending", "active", "in_progress", "returned"];
const defaultId = () => crypto.randomUUID();

type AssigneeFields = Pick<EngineStep, "assigneeName" | "assigneeEmail" | "assigneePhone">;

const fromPerson = (p: Person): AssigneeFields => ({ assigneeName: p.name, assigneeEmail: p.email, assigneePhone: p.phone });

/** The answer of an assignee field: a saved contact's id, an email, a phone, or a {name,email,phone} object. */
function assigneeFrom(value: unknown, contacts: Record<string, Person> = {}): AssigneeFields {
  if (typeof value === "string" && value.trim()) {
    const v = value.trim();
    const contact = contacts[v];
    if (contact) return fromPerson(contact);
    return v.includes("@") ? { assigneeEmail: v, assigneeName: v } : { assigneePhone: v };
  }
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    const str = (k: string) => (typeof o[k] === "string" && o[k] ? (o[k] as string) : undefined);
    return { assigneeName: str("name"), assigneeEmail: str("email"), assigneePhone: str("phone") };
  }
  return {};
}

const withoutEmpty = (a: AssigneeFields): AssigneeFields => Object.fromEntries(Object.entries(a).filter(([, v]) => !!v)) as AssigneeFields;

/**
 * Build the (all pending) steps of a request from the package workflow.
 * A `group_all` step becomes one parallel step per member (none when the group is empty: the step is
 * created without a person, so the admin sees it waiting and can delegate it).
 */
export function planSteps(workflow: Workflow, answers: Answers, newId: () => string = defaultId, people: PeopleDirectory = {}): EngineStep[] {
  const base = (w: WorkflowStep, who: AssigneeFields): EngineStep => ({
    id: newId(),
    order: w.order,
    role: w.role,
    action: w.action,
    status: "pending" as const,
    otpRequired: !!w.otpRequired,
    skipIf: w.skipIf,
    assigneeFromFieldId: w.assigneeFromFieldId,
    ...who,
  });
  return [...workflow.steps]
    .sort((a, b) => a.order - b.order)
    .flatMap((w) => {
      switch (assigneeKindOf(w)) {
        case "contact": {
          const c = w.contactId ? people.contacts?.[w.contactId] : undefined;
          return [base(w, c ? fromPerson(c) : { assigneeName: w.assignee?.name })];
        }
        case "group_all": {
          const members = (w.groupId ? people.groups?.[w.groupId] : undefined) ?? [];
          return members.length ? members.map((m) => base(w, fromPerson(m))) : [base(w, {})];
        }
        case "requester":
          return [base(w, people.requester ? fromPerson(people.requester) : {})];
        case "from_field":
          return [base(w, { assigneeName: w.assignee?.name, assigneeEmail: w.assignee?.email, assigneePhone: w.assignee?.phone, ...assigneeFrom(answers[w.assigneeFromFieldId!], people.contacts) })];
        default:
          return [base(w, { assigneeName: w.assignee?.name, assigneeEmail: w.assignee?.email, assigneePhone: w.assignee?.phone })];
      }
    });
}

function find(steps: EngineStep[], id: string): EngineStep {
  const s = steps.find((x) => x.id === id);
  if (!s) throw new Error(`step not found: ${id}`);
  return s;
}

const clone = (steps: EngineStep[]) => steps.map((s) => ({ ...s }));

/** Activate the lowest order that still has work; skip steps whose `skipIf` holds. Repeats until something is active or all done. */
/**
 * `contacts` resolves a "group" dropdown answer (a contact id). A step routed by a field ("המייל שמולא בשדה") whose
 * person is still unknown takes it from the answers when it is activated, so an email filled in step 9 reaches step 10.
 */
export function activateNext(input: EngineStep[], answers: Answers, contacts: Record<string, Person> = {}): EngineResult {
  const steps = clone(input);
  const events: EngineEvent[] = [];
  if (steps.some((s) => s.status === "declined" || s.status === "expired")) return { steps, events };

  for (;;) {
    const open = steps.filter((s) => OPEN.includes(s.status));
    if (open.length === 0) {
      if (steps.some((s) => s.status === "completed") && requestStatus(steps) === "completed") {
        events.push({ type: "request_completed" });
      }
      return { steps, events };
    }
    const order = Math.min(...open.map((s) => s.order));
    const group = open.filter((s) => s.order === order);
    if (group.some((s) => s.status === "active" || s.status === "in_progress")) return { steps, events };

    let skippedAny = false;
    for (const s of group) {
      if (s.skipIf && evaluateCondition(s.skipIf, answers)) {
        s.status = "skipped";
        skippedAny = true;
        events.push({ type: "step_skipped", stepId: s.id });
      } else {
        s.status = "active";
        if (s.assigneeFromFieldId && !s.assigneeEmail && !s.assigneePhone) Object.assign(s, withoutEmpty(assigneeFrom(answers[s.assigneeFromFieldId], contacts)));
        events.push({ type: "step_activated", stepId: s.id, payload: { order: s.order, role: s.role } });
      }
    }
    if (!skippedAny || group.some((s) => s.status === "active")) return { steps, events };
  }
}

/** First open of an active step (link opened) → in_progress. */
export function openStep(input: EngineStep[], stepId: string): EngineResult {
  const steps = clone(input);
  const s = find(steps, stepId);
  const events: EngineEvent[] = [];
  if (s.status === "active") {
    s.status = "in_progress";
    events.push({ type: "step_opened", stepId });
  }
  return { steps, events };
}

export function completeStep(input: EngineStep[], stepId: string, answers: Answers, contacts: Record<string, Person> = {}): EngineResult {
  const steps = clone(input);
  const s = find(steps, stepId);
  if (s.status !== "active" && s.status !== "in_progress") throw new Error(`cannot complete a ${s.status} step`);
  s.status = "completed";
  const next = activateNext(steps, answers, contacts);
  return { steps: next.steps, events: [{ type: "step_completed", stepId }, ...next.events] };
}

export function declineStep(input: EngineStep[], stepId: string, reason: string): EngineResult {
  if (!reason.trim()) throw new Error("decline reason is required");
  const steps = clone(input);
  const s = find(steps, stepId);
  if (s.status !== "active" && s.status !== "in_progress") throw new Error(`cannot decline a ${s.status} step`);
  s.status = "declined";
  s.declineReason = reason.trim();
  for (const o of steps) if (o !== s && OPEN.includes(o.status)) o.status = "cancelled";
  return { steps, events: [{ type: "step_declined", stepId, payload: { reason: s.declineReason } }, { type: "request_declined" }] };
}

/** Send the request back to an earlier, completed step. The returning step waits as `returned`. */
export function returnTo(input: EngineStep[], fromStepId: string, toStepId: string, reason: string): EngineResult {
  if (!reason.trim()) throw new Error("return reason is required");
  const steps = clone(input);
  const from = find(steps, fromStepId);
  const to = find(steps, toStepId);
  if (from.status !== "active" && from.status !== "in_progress") throw new Error(`cannot return from a ${from.status} step`);
  if (to.order >= from.order) throw new Error("can only return to an earlier step");
  if (to.status !== "completed") throw new Error("target step must be completed");

  from.status = "returned";
  from.returnReason = reason.trim();
  from.returnedToStepId = to.id;
  to.status = "active";
  for (const s of steps) {
    if (s === from || s === to) continue;
    const between = s.order > to.order && s.order < from.order;
    const sameOrderActive = s.order === from.order && (s.status === "active" || s.status === "in_progress");
    if ((between && (s.status === "completed" || s.status === "active" || s.status === "in_progress")) || sameOrderActive) {
      s.status = "pending";
    }
  }
  return {
    steps,
    events: [
      { type: "step_returned", stepId: fromStepId, payload: { toStepId, reason: from.returnReason } },
      { type: "step_activated", stepId: toStepId, payload: { order: to.order, role: to.role, reactivated: true } },
    ],
  };
}

/** Hand the step to another person: the old step becomes `delegated`, a fresh active one takes its place. */
export function delegate(
  input: EngineStep[],
  stepId: string,
  assignee: { name?: string; email?: string; phone?: string },
  newId: () => string = defaultId,
): EngineResult {
  const steps = clone(input);
  const old = find(steps, stepId);
  if (old.status !== "active" && old.status !== "in_progress") throw new Error(`cannot delegate a ${old.status} step`);
  old.status = "delegated";
  const fresh: EngineStep = {
    ...old,
    id: newId(),
    status: "active",
    assigneeName: assignee.name,
    assigneeEmail: assignee.email,
    assigneePhone: assignee.phone,
    delegatedFromStepId: old.id,
  };
  steps.splice(steps.indexOf(old) + 1, 0, fresh);
  return { steps, events: [{ type: "step_delegated", stepId, payload: { newStepId: fresh.id } }] };
}

/** Request deadline passed: active steps expire; the request becomes expired. */
export function expire(input: EngineStep[]): EngineResult {
  const steps = clone(input);
  const events: EngineEvent[] = [];
  for (const s of steps) {
    if (s.status === "active" || s.status === "in_progress" || s.status === "returned") {
      s.status = "expired";
      events.push({ type: "step_expired", stepId: s.id });
    }
  }
  if (events.length) events.push({ type: "request_expired" });
  return { steps, events };
}

export function cancelAll(input: EngineStep[], reason: string): EngineResult {
  const steps = clone(input);
  for (const s of steps) if (OPEN.includes(s.status)) s.status = "cancelled";
  return { steps, events: [{ type: "request_cancelled", payload: { reason } }] };
}

export function requestStatus(steps: EngineStep[]): RequestStatus {
  if (steps.some((s) => s.status === "declined")) return "declined";
  if (steps.some((s) => s.status === "expired")) return "expired";
  if (steps.some((s) => s.status === "cancelled")) return "cancelled";
  if (steps.length > 0 && steps.every((s) => DONE.includes(s.status))) return "completed";
  if (steps.some((s) => s.status === "returned")) return "returned";
  if (steps.some((s) => s.status !== "pending")) return "in_progress";
  return "draft";
}

/** `order` of the step(s) currently waiting (0 when nothing is open). */
export function currentOrder(steps: EngineStep[]): number {
  const open = steps.filter((s) => OPEN.includes(s.status));
  return open.length ? Math.min(...open.map((s) => s.order)) : 0;
}
