/** Which pages a filler actually goes through (visibility + "jump to page" rules). Pure; no validation imports. */
import { evaluateCondition, type Answers } from "./conditions";
import type { FormDefinition } from "./schema";

export function visiblePageIndexes(form: FormDefinition, answers: Answers): number[] {
  return form.pages.flatMap((p, i) => (evaluateCondition(p.visibleIf, answers) ? [i] : []));
}

/** The page after `current`: the first matching jump rule (forward only), else the next visible page. null = finish. */
export function nextPageIndex(form: FormDefinition, answers: Answers, current: number): number | null {
  const visible = visiblePageIndexes(form, answers);
  for (const rule of form.pages[current]?.nextPage ?? []) {
    if (!evaluateCondition(rule.if, answers)) continue;
    if (rule.goTo === "end") return null;
    const target = form.pages.findIndex((p) => p.id === rule.goTo);
    if (target > current && visible.includes(target)) return target;
  }
  return visible.find((i) => i > current) ?? null;
}

export function prevPageIndex(form: FormDefinition, answers: Answers, current: number): number | null {
  // Walk the path from the start so "back" returns to the page the filler actually came from.
  const path = reachedPageIndexes(form, answers);
  const at = path.indexOf(current);
  if (at > 0) return path[at - 1]!;
  return visiblePageIndexes(form, answers).filter((i) => i < current).at(-1) ?? null;
}

/** Pages on the filler's path, in order: from the first visible page following jumps until the end. */
export function reachedPageIndexes(form: FormDefinition, answers: Answers): number[] {
  const first = visiblePageIndexes(form, answers)[0];
  if (first === undefined) return [];
  const out = [first];
  for (let cur: number | null = first; ; ) {
    cur = nextPageIndex(form, answers, cur);
    if (cur === null || out.includes(cur)) break;
    out.push(cur);
  }
  return out;
}
