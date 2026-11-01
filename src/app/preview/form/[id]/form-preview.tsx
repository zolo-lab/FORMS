"use client";
import { useState } from "react";
import { FormTestFill, type TestFillPdf } from "@/components/forms/FormTestFill";
import { Select } from "@/components/ui/input";
import { roleView } from "@/lib/forms/role-view";
import type { FillerRole, FormDefinition } from "@/lib/forms/schema";
import type { StepView } from "@/lib/workflow/step-fields";

/** The form as one step sees it (step 1 by default: what the sender fills); "כל הטופס" shows every field. */
export function FormPreview({ definition, pdf, steps, startWithAll = false, showSteps = false }: { definition: FormDefinition; pdf?: TestFillPdf; steps: StepView[]; startWithAll?: boolean; showSteps?: boolean }) {
  const [role, setRole] = useState<FillerRole | "">(startWithAll ? "" : (steps[0]?.role ?? ""));
  const shown = role ? roleView(definition, {}, role).definition : definition;
  return (
    <div className="space-y-4">
      {showSteps && steps.length > 0 && (
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">צפייה בטופס כפי שרואה</span>
          <Select className="h-9 w-64" aria-label="צפייה כשלב" value={role} onChange={(e) => setRole(e.target.value as FillerRole | "")}>
            {steps.map((s) => <option key={s.index} value={s.role}>{s.label}</option>)}
            <option value="">כל הטופס (כל השלבים)</option>
          </Select>
        </label>
      )}
      {shown.pages.length === 0 ? (
        <p className="rounded-md border bg-card p-6 text-center text-sm text-muted-foreground">אין בשלב הזה שדות למילוי. בחרו שלב אחר למעלה, או שייכו לו שדות ב&quot;סימון שדות לשלב&quot;.</p>
      ) : (
        <FormTestFill key={role} definition={shown} pdf={pdf} />
      )}
    </div>
  );
}
