"use client";

import { Select } from "@/components/ui/input";
import { ROLE_LABELS } from "@/lib/workflow/labels";
import { stepChoices } from "@/lib/workflow/step-who";
import type { FillerRole } from "@/lib/forms/schema";
import type { WorkflowStep } from "@/lib/workflow/types";

export type FormSteps = Pick<WorkflowStep, "role" | "assigneeKind" | "assigneeFromFieldId" | "contactId">[];

/** "באיזה שלב השדה מופיע": the form's own steps. A field with no role belongs to the employee, as before. */
export function StepSelect({ steps, value, onChange, className, id }: { steps: FormSteps; value: FillerRole | undefined; onChange: (role: FillerRole) => void; className?: string; id?: string }) {
  const role = value ?? "employee";
  const choices = stepChoices(steps, ROLE_LABELS, role);
  return (
    <Select id={id} aria-label="באיזה שלב" className={className} value={role} onChange={(e) => onChange(e.target.value as FillerRole)}>
      {choices.map((c) => <option key={c.role} value={c.role}>{c.label}</option>)}
    </Select>
  );
}
