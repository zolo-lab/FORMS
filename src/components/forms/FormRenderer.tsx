"use client";
import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Answers } from "@/lib/forms/conditions";
import { computeFormulas } from "@/lib/forms/compute";
import { withCopies } from "@/lib/forms/copy";
import { narrowListChoices, withListPicks } from "@/lib/forms/linked";
import { withDefaults } from "@/lib/forms/defaults";
import { STATIC_LOOKUPS, type Lookups } from "@/lib/forms/lookups";
import { fillsIn, type FillerRole, type FormDefinition } from "@/lib/forms/schema";
import { validateAnswers, type FieldErrors } from "@/lib/forms/validate";
import { nextPageIndex, prevPageIndex, reachedPageIndexes, resumePageIndex, validatePage, visiblePageIndexes } from "@/lib/forms/wizard";
import { evaluateCondition } from "@/lib/forms/conditions";
import { pipeText } from "@/lib/forms/piping";
import { CardFlow } from "./CardFlow";
import { FieldRow } from "./fields/registry";
import type { RenderCtx, UploadFn } from "./fields/types";

export interface FormRendererProps {
  definition: FormDefinition;
  answers: Answers;
  onChange: (answers: Answers) => void;
  /** Extra errors from the server; merged with local page validation. */
  errors?: FieldErrors;
  /** Role of the current filler; fields of other roles are shown read-only. */
  role?: FillerRole;
  mode?: "fill" | "readonly";
  /** Called with `cleaned` answers after the whole form validates. */
  onSubmit?: (cleaned: Answers) => void | Promise<void>;
  lookups?: Lookups;
  onUpload?: UploadFn;
  /** Fields from other roles used by `{{piping}}`, so their values can be formatted. */
  pipeDefinition?: FormDefinition;
  /** Injectable for tests. */
  today?: string;
  /** More buttons of this step (e.g. "דחייה"), on the same line as "שליחה", next to it. */
  actions?: ReactNode;
  /** Only the fields: no page navigation, sending or summary alert (used inside another flow, e.g. after the document). */
  fieldsOnly?: boolean;
}

export function FormRenderer({
  definition: baseDefinition, answers: rawAnswers, onChange, errors: serverErrors = {}, role, mode = "fill", onSubmit, lookups = STATIC_LOOKUPS, onUpload, today, pipeDefinition, actions, fieldsOnly = false,
}: FormRendererProps) {
  const readonly = mode === "readonly";
  const todayStr = today ?? new Date().toISOString().slice(0, 10);
  // Defaults, the record picked from a list (its values into the linked fields, its options into linked choices),
  // iForms-style copies ("fname1" ← "fname") and computed (formula) fields are filled live; the server applies all
  // of them again on submit.
  const picked = useMemo(() => withListPicks(baseDefinition, withDefaults(baseDefinition, rawAnswers, todayStr), lookups), [baseDefinition, rawAnswers, todayStr, lookups]);
  const definition = useMemo(() => narrowListChoices(baseDefinition, picked, lookups), [baseDefinition, picked, lookups]);
  const answers = useMemo(() => computeFormulas(definition, withCopies(definition, picked), todayStr), [definition, picked, todayStr]);
  const layout = definition.settings?.layout ?? "wizard";
  const wizard = layout === "wizard" && !readonly;
  const cardMode = layout === "card" && !readonly;
  // Coming back to a half-filled wizard lands on the step that still needs something, not on step 1.
  const [pageIndex, setPageIndex] = useState(() => (wizard ? resumePageIndex(definition, answers, { role, today: todayStr }) : 0));
  const [localErrors, setLocalErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const errors = { ...serverErrors, ...localErrors };
  // In wizard layout the progress bar follows the path the filler takes (jump rules skip pages).
  const visible = useMemo(() => (wizard ? reachedPageIndexes(definition, answers) : visiblePageIndexes(definition, answers)), [definition, answers, wizard]);
  const current = visible.includes(pageIndex) ? pageIndex : (visible[0] ?? 0);
  const step = Math.max(visible.indexOf(current), 0);
  const next = nextPageIndex(definition, answers, current);
  const prev = prevPageIndex(definition, answers, current);

  const ctx: RenderCtx = {
    lookups,
    onUpload,
    errors,
    readonlyAll: readonly,
    pipe: (text, scope) => pipeText(text, { ...answers, ...scope }, pipeDefinition ? { ...definition, pages: [...definition.pages, ...pipeDefinition.pages] } : definition),
    roleReadOnly: (f) => !!f.formula || (!!f.disabledIf && evaluateCondition(f.disabledIf, answers)) || (!!role && !fillsIn(f, role)),
  };

  const setField = (id: string, v: unknown) => {
    const nextAnswers = { ...rawAnswers, [id]: v };
    if (v === undefined) delete nextAnswers[id];
    onChange(nextAnswers);
    // Clear this field's local errors as soon as the user edits it.
    if (Object.keys(localErrors).some((k) => k === id || k.startsWith(`${id}.`))) {
      setLocalErrors(Object.fromEntries(Object.entries(localErrors).filter(([k]) => k !== id && !k.startsWith(`${id}.`))));
    }
  };

  function focusFirstError(errs: FieldErrors) {
    const first = Object.keys(errs)[0];
    if (!first) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(`f-${first}`) ?? document.querySelector(`[data-field="f-${first}"]`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      (el as HTMLElement | null)?.focus?.();
    });
  }

  function go(index: number) {
    setLocalErrors({});
    setPageIndex(index);
    topRef.current?.scrollIntoView({ block: "start" });
  }

  async function handleNext() {
    const errs = validatePage(definition, answers, current, { role, today });
    if (Object.keys(errs).length) { setLocalErrors(errs); focusFirstError(errs); return; }
    if (next !== null) go(next);
  }

  async function handleSubmit() {
    const result = validateAnswers(definition, answers, { role, today });
    if (!result.ok) {
      setLocalErrors(result.errors);
      // Jump to the page holding the first error.
      const firstKey = Object.keys(result.errors)[0]!.split(".")[0]!;
      const idx = definition.pages.findIndex((p) => p.fields.some((f) => f.id === firstKey));
      if (wizard && idx >= 0) setPageIndex(idx);
      focusFirstError(result.errors);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit?.(result.cleaned);
    } finally {
      setSubmitting(false);
    }
  }

  const pages = wizard ? [definition.pages[current]!] : visible.map((i) => definition.pages[i]!);
  const lastStep = wizard ? next === null : true;

  return (
    <div ref={topRef} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{definition.title}</h1>
        {definition.description && <p className="mt-1 text-muted-foreground">{definition.description}</p>}
      </div>

      {cardMode && (
        <CardFlow definition={definition} answers={answers} onField={setField} ctx={ctx} role={role} today={today} serverErrors={serverErrors} onSubmit={onSubmit} />
      )}

      {!cardMode && wizard && visible.length > 1 && (
        <div aria-label={`עמוד ${step + 1} מתוך ${visible.length}`}>
          <div className="mb-1 flex justify-between text-sm text-muted-foreground">
            <span>{definition.pages[current]?.title}</span>
            <span>עמוד {step + 1} מתוך {visible.length}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={1} aria-valuemax={visible.length} aria-valuenow={step + 1}>
            <div className="h-full bg-primary transition-all" style={{ width: `${((step + 1) / visible.length) * 100}%` }} />
          </div>
        </div>
      )}

      {!cardMode && pages.map((page) => (
        <section key={page.id} className="space-y-4" aria-label={page.title}>
          {(!wizard || visible.length <= 1) && page.title && <h2 className="text-xl font-semibold">{page.title}</h2>}
          {page.description && <p className="text-sm text-muted-foreground">{page.description}</p>}
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-6">
            {page.fields.map((field) => (
              <FieldRow key={field.id} field={field} scope={answers} rootAnswers={answers} onField={setField} prefix="" parentDisabled={false} ctx={ctx} />
            ))}
          </div>
        </section>
      ))}

      {!cardMode && !fieldsOnly && Object.keys(errors).length > 0 && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">יש שדות שדורשים תיקון</p>
      )}

      {!readonly && !cardMode && !fieldsOnly && (
        <div className="flex justify-between gap-2 border-t pt-4">
          {/* The step forward ("הבא" / "שליחה") at the start of the line – the right side in Hebrew; "הקודם" at the end. */}
          {lastStep ? (
            <span className="flex flex-wrap items-center gap-2">
              {onSubmit && <Button className="min-w-32" disabled={submitting} onClick={handleSubmit}>{submitting ? "שולח…" : (definition.settings?.submitLabel ?? "שליחה")}</Button>}
              {actions}
            </span>
          ) : (
            <Button className="min-w-32" onClick={handleNext}>הבא</Button>
          )}
          {wizard && prev !== null ? <Button variant="outline" onClick={() => go(prev)}>הקודם</Button> : <span />}
        </div>
      )}
    </div>
  );
}
