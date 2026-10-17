/** Per-request approval chain (6.15b): helpers for editing a copy of the package workflow. Pure, so it is unit tested. */
import { validateWorkflow } from "./validate-workflow";
import type { StepRole, Workflow, WorkflowStep } from "./types";

/** Steps the system fills by itself (the opener and the person the request is about); they cannot be removed or re-routed. */
export const FIXED_ROLES: StepRole[] = ["requester", "employee"];

const sorted = (steps: WorkflowStep[]) => [...steps].sort((a, b) => a.order - b.order);

/** A new approver step after everything else. */
export function addApprover(chain: WorkflowStep[], assignee: { name: string; email?: string; phone?: string }): WorkflowStep[] {
  const order = Math.max(0, ...chain.map((s) => s.order)) + 1;
  return [...sorted(chain), { order, role: "approver", action: "approve", assignee }];
}

/** Remove a step by position in the sorted chain; the opener/employee steps stay. */
export function removeStep(chain: WorkflowStep[], index: number): WorkflowStep[] {
  const s = sorted(chain);
  if (!s[index] || FIXED_ROLES.includes(s[index]!.role)) return s;
  return s.filter((_, i) => i !== index);
}

export function chainEquals(a: WorkflowStep[], b: WorkflowStep[]): boolean {
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

export type ChainCheck = { ok: true; workflow: Workflow | null } | { ok: false; errors: string[] };

/**
 * What to store for a request: `null` when the chain is the package's own (no override), the edited workflow
 * when it is valid, otherwise the problems. The edited chain must keep the package's opener and employee steps.
 */
export function checkChain(pkgWorkflow: Workflow, edited: Workflow): ChainCheck {
  if (chainEquals(pkgWorkflow.steps, edited.steps)) return { ok: true, workflow: null };
  const errors = validateWorkflow(edited);
  const need = (r: StepRole) => pkgWorkflow.steps.filter((s) => s.role === r).length;
  for (const r of FIXED_ROLES) if (edited.steps.filter((s) => s.role === r).length !== need(r)) errors.push(`אי אפשר להוסיף או להסיר שלבי ${r === "employee" ? "עובד" : "מבקש"}`);
  if (edited.steps.length === 0) errors.push("השרשרת ריקה");
  return errors.length ? { ok: false, errors } : { ok: true, workflow: { ...pkgWorkflow, steps: sorted(edited.steps) } };
}
