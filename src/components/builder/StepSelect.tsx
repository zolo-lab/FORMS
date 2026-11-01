"use client";

import { Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FillerRole } from "@/lib/forms/schema";
import type { StepView } from "@/lib/workflow/step-fields";

export type { StepView };

/**
 * "באיזה שלב השדה מופיע": one option per step of the form ("שלב 2 · העובד"). A field that is in no step says so,
 * and is never shown as belonging to a step the form does not have.
 */
export function StepSelect({ views, value, onChange, className, id }: { views: StepView[]; value: FillerRole | undefined; onChange: (role: FillerRole) => void; className?: string; id?: string }) {
  const role = value ?? "employee";
  const inStep = views.some((v) => v.role === role);
  return (
    <Select
      id={id}
      aria-label="באיזה שלב"
      className={cn(className, !inStep && "border-destructive text-destructive")}
      value={inStep ? role : ""}
      onChange={(e) => e.target.value && onChange(e.target.value as FillerRole)}
    >
      {!inStep && <option value="">לא משויך לשלב – בחרו שלב</option>}
      {views.map((v) => <option key={v.index} value={v.role}>{v.label}</option>)}
    </Select>
  );
}
