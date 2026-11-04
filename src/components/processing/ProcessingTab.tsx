"use client";
import { Check, Loader2, Mail, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { destinationProblems, newDestinationId, type ProcessingContext } from "@/lib/processing/model";
import { COMPLETION_DESTINATION_ID, type Destination, type Processing } from "@/lib/processing/types";
import type { StepsSaveState } from "@/components/packages/StepsEditor";
import { DestinationCard } from "./DestinationCard";

/**
 * "עיבוד טופס": what happens to the signed documents once every step is done. The steps themselves are shown
 * read-only at the top — they are edited in "שלבי הטופס", and this tab reads the very same live value, so a step
 * renamed, moved or deleted there is reflected here before anything is saved.
 */
export function ProcessingTab({
  value, onChange, ctx, dirty, state, onSave, waitingForForm, onEditSteps,
}: {
  value: Processing;
  onChange: (next: Processing) => void;
  ctx: ProcessingContext;
  dirty: boolean;
  state: StepsSaveState;
  onSave: () => void;
  /** The form itself still has unsaved changes (its fields are read by the server when saving). */
  waitingForForm: boolean;
  onEditSteps: () => void;
}) {
  const [open, setOpen] = useState<string | null>(COMPLETION_DESTINATION_ID);
  const steps = ctx.steps ?? [];
  const problems = value.destinations.flatMap((d) => destinationProblems(d, ctx));

  const patch = (id: string, next: Destination) => onChange({ ...value, destinations: value.destinations.map((d) => (d.id === id ? next : d)) });
  const addEmail = () => {
    const id = newDestinationId();
    onChange({ ...value, destinations: [...value.destinations, { id, kind: "email", attach: true, items: [{ kind: "full" }], to: [] }] });
    setOpen(id);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <section className="space-y-3" aria-labelledby="proc-h">
        <div>
          <h2 id="proc-h" className="text-lg font-semibold">עיבוד טופס</h2>
          <p className="text-sm text-muted-foreground">מה קורה למסמכים אחרי שכל השלבים הסתיימו: לאן הם נשלחים ולמי.</p>
        </div>

        {/* The route, as "שלבי הטופס" has it right now. Read-only on purpose: one place edits the steps. */}
        <div className="rounded-lg border bg-muted/40 p-3">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
            {steps.length === 0 ? (
              <span className="text-muted-foreground">עדיין אין שלבים.</span>
            ) : (
              steps.map((s, i) => (
                <span key={s.role} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-muted-foreground" aria-hidden>←</span>}
                  <span className="rounded-full bg-card px-2.5 py-0.5 text-xs ring-1 ring-border">{s.label}</span>
                </span>
              ))
            )}
            <span className="text-muted-foreground" aria-hidden>←</span>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">עיבוד</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            השלבים נקבעים ב<button type="button" onClick={onEditSteps} className="underline hover:text-foreground">שלבי הטופס</button>.
          </p>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="dest-h">
        <h3 id="dest-h" className="text-base font-semibold">לאן זה נשלח</h3>
        <ul className="space-y-2">
          {value.destinations.map((d) => (
            <DestinationCard
              key={d.id}
              destination={d}
              ctx={ctx}
              open={open === d.id}
              onToggle={() => setOpen(open === d.id ? null : d.id)}
              onChange={(next) => patch(d.id, next)}
              onRemove={() => { onChange({ ...value, destinations: value.destinations.filter((x) => x.id !== d.id) }); setOpen(null); }}
            />
          ))}
        </ul>
        <Button type="button" variant="outline" onClick={addEmail}>
          <Plus className="size-4" aria-hidden /><Mail className="size-4" aria-hidden />הוספת יעד מייל
        </Button>
        <p className="text-xs text-muted-foreground">תיוק בתיקיית דרייב, חיתוך המסמך לחלקים והעברת המסמכים הנלווים – בשלבים הבאים של הבנייה.</p>
      </section>

      <div className={cn("sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur")}>
        <Button type="button" onClick={onSave} disabled={state.kind === "saving" || !dirty || problems.length > 0 || waitingForForm}>
          {state.kind === "saving" && <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />}
          {state.kind === "saving" ? "שומר…" : "שמירת העיבוד"}
        </Button>
        <span aria-live="polite" className="text-sm">
          {state.kind === "saved" && !dirty ? (
            <span role="status" className="inline-flex items-center gap-1 text-success"><Check className="size-4" aria-hidden />העיבוד נשמר</span>
          ) : problems.length > 0 ? (
            <span className="text-destructive">יש {problems.length === 1 ? "פרט אחד" : `${problems.length} פרטים`} להשלים ביעדים</span>
          ) : waitingForForm ? (
            <span className="text-muted-foreground">שומר את הטופס…</span>
          ) : dirty ? (
            <span className="text-muted-foreground">יש שינויים שלא נשמרו</span>
          ) : null}
        </span>
        {state.kind === "error" && (
          <ul role="alert" className="basis-full list-inside list-disc text-sm text-destructive">
            {state.errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
