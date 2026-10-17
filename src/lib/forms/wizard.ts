/** Pure helpers for the multi-page fill flow (used by FormRenderer and tests). */
import { evaluateCondition, type Answers } from "./conditions";
import type { FillerRole, FormDefinition, FormField } from "./schema";
import { validateAnswers, type FieldErrors } from "./validate";

import { FIELD_TYPE_META } from "./field-types";
import { reachedPageIndexes } from "./paths";

export { nextPageIndex, prevPageIndex, reachedPageIndexes, visiblePageIndexes } from "./paths";

/** Errors of the whole form, restricted to fields that live on the given page. */
export function validatePage(
  form: FormDefinition,
  answers: Answers,
  pageIndex: number,
  options: { role?: FillerRole; today?: string } = {},
): FieldErrors {
  const page = form.pages[pageIndex];
  if (!page) return {};
  const ids = new Set(page.fields.map((f) => f.id));
  const all = validateAnswers(form, answers, options).errors;
  return Object.fromEntries(Object.entries(all).filter(([key]) => ids.has(key.split(".")[0]!)));
}

/** Whether to show the required asterisk right now. */
export function fieldIsRequired(field: FormField, answers: Answers): boolean {
  return !!field.required || (field.requiredIf ? evaluateCondition(field.requiredIf, answers) : false);
}

/** A step has errors, or a question of this filler's that is shown and still has no answer (optional ones too: the step was not finished). */
function pageNeedsAttention(form: FormDefinition, answers: Answers, index: number, options: { role?: FillerRole; today?: string }): boolean {
  if (Object.keys(validatePage(form, answers, index, options)).length > 0) return true;
  return form.pages[index]!.fields.some((f) => {
    if (!FIELD_TYPE_META[f.type].hasAnswer || f.formula || f.type === "hidden") return false;
    if (options.role && (f.filledBy ?? "employee") !== options.role) return false;
    if (f.visibleIf && !evaluateCondition(f.visibleIf, answers)) return false;
    const v = answers[f.id];
    return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
  });
}

/**
 * Where a person who comes back to a half-filled form should land: with nothing answered, the first step; otherwise
 * the first step on their path that still has something to fix or fill, and when every step is fine, the last one
 * (only "send" is left). Works from the saved answers alone, so it holds on any device.
 */
export function resumePageIndex(form: FormDefinition, answers: Answers, options: { role?: FillerRole; today?: string } = {}): number {
  const path = reachedPageIndexes(form, answers);
  if (path.length === 0) return 0;
  if (Object.keys(answers).length === 0) return path[0]!;
  for (const index of path) if (pageNeedsAttention(form, answers, index, options)) return index;
  return path[path.length - 1]!;
}
