/** Evaluate show/hide and required-if conditions against current answers. */
import type { Condition } from "./schema";

export type Answers = Record<string, unknown>;

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.values(v as object).every(isEmpty);
  return false;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function compareOrdered(a: unknown, b: unknown): number | null {
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na !== null && nb !== null) return na - nb;
  // ISO dates / times compare lexicographically.
  if (typeof a === "string" && typeof b === "string" && a && b) return a < b ? -1 : a > b ? 1 : 0;
  return null;
}

function looseEq(a: unknown, b: unknown): boolean {
  if (typeof a === "boolean" || typeof b === "boolean") return String(a) === String(b);
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na !== null && nb !== null) return na === nb;
  return a === b;
}

/** Read a value; supports "table.column" is NOT supported at top level on purpose. */
export function getAnswer(answers: Answers, field: string): unknown {
  return answers[field];
}

export function evaluateCondition(cond: Condition | undefined, answers: Answers): boolean {
  if (!cond) return true;
  if ("all" in cond) return cond.all.every((c) => evaluateCondition(c, answers));
  if ("any" in cond) return cond.any.some((c) => evaluateCondition(c, answers));
  if ("not" in cond) return !evaluateCondition(cond.not, answers);

  const actual = getAnswer(answers, cond.field);
  const expected = cond.value;
  switch (cond.op) {
    case "empty":
      return isEmpty(actual);
    case "notEmpty":
      return !isEmpty(actual);
    // A list answer (multiple choice) "equals" a single value when it includes it.
    case "eq":
      return Array.isArray(actual) && !Array.isArray(expected) ? actual.some((a) => looseEq(a, expected)) : looseEq(actual, expected);
    case "neq":
      return !evaluateCondition({ field: cond.field, op: "eq", value: expected }, answers);
    case "in":
      return Array.isArray(expected) && expected.some((e) => looseEq(actual, e));
    case "notIn":
      return !(Array.isArray(expected) && expected.some((e) => looseEq(actual, e)));
    case "contains":
      return Array.isArray(actual)
        ? actual.some((a) => looseEq(a, expected))
        : typeof actual === "string" && typeof expected === "string" && actual.includes(expected);
    case "notContains":
      return !evaluateCondition({ field: cond.field, op: "contains", value: expected }, answers);
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const c = compareOrdered(actual, expected);
      if (c === null) return false;
      return cond.op === "gt" ? c > 0 : cond.op === "gte" ? c >= 0 : cond.op === "lt" ? c < 0 : c <= 0;
    }
  }
}

/** Field ids referenced by a condition (used by the builder to validate references). */
export function conditionFieldRefs(cond: Condition | undefined): string[] {
  if (!cond) return [];
  if ("all" in cond) return cond.all.flatMap(conditionFieldRefs);
  if ("any" in cond) return cond.any.flatMap(conditionFieldRefs);
  if ("not" in cond) return conditionFieldRefs(cond.not);
  return [cond.field];
}
