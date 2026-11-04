"use client";

import { Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fillsIn, type FillerRole, type FormField } from "@/lib/forms/schema";
import { withStep } from "@/lib/workflow/step-fields";
import type { StepView } from "@/lib/workflow/step-fields";

export type { StepView };

/**
 * "באיזה שלב השדה מופיע": one option per step of the form ("שלב 2 · העובד"). A field that is in no step says so,
 * and is never shown as belonging to a step the form does not have.
 */
export function StepSelect({ views, value, onChange, className, id, label = "באיזה שלב" }: { views: StepView[]; value: FillerRole | undefined; onChange: (role: FillerRole) => void; className?: string; id?: string; label?: string }) {
  const role = value ?? "employee";
  const inStep = views.some((v) => v.role === role);
  return (
    <Select
      id={id}
      aria-label={label}
      className={cn(className, !inStep && "border-destructive text-destructive")}
      value={inStep ? role : ""}
      onChange={(e) => e.target.value && onChange(e.target.value as FillerRole)}
    >
      {!inStep && <option value="">לא משויך לשלב – בחרו שלב</option>}
      {views.map((v) => <option key={v.index} value={v.role}>{v.label}</option>)}
    </Select>
  );
}

/**
 * "באילו שלבים השדה פתוח לעריכה": a box per step of the form. A field may be in several steps (the employee fills it,
 * the secretary can still correct it); its earliest step is its own. With none ticked it is "לא משויך לשלב".
 */
export function StepChecks({ views, field, onChange }: { views: StepView[]; field: Pick<FormField, "filledBy" | "alsoFilledBy">; onChange: (patch: Pick<FormField, "filledBy" | "alsoFilledBy">) => void }) {
  const roles = views.map((v) => v.role);
  const none = !roles.some((r) => fillsIn(field, r));
  return (
    <fieldset className="space-y-1">
      <legend className="sr-only">באילו שלבים השדה פתוח לעריכה</legend>
      {views.map((v) => (
        <label key={v.index} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-1 hover:bg-accent">
          <input type="checkbox" className="size-4 accent-primary" checked={fillsIn(field, v.role)} onChange={(e) => onChange(withStep(field, v.role, e.target.checked, roles))} />
          <span className="text-sm">{v.label}</span>
        </label>
      ))}
      {none && <p className="text-xs text-destructive">לא משויך לשלב: אף אחד לא יראה את השדה. סמנו לפחות שלב אחד.</p>}
    </fieldset>
  );
}
