/** Pure helpers for the multi-page fill flow (used by FormRenderer and tests). */
import { evaluateCondition, type Answers } from "./conditions";
import type { FillerRole, FormDefinition, FormField } from "./schema";
import { validateAnswers, type FieldErrors } from "./validate";

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
