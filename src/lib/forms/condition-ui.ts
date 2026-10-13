/**
 * The visual condition editor works on a flat list of rules joined by AND / OR.
 * Anything more nested is still valid in the data, but shown as "complex" (kept as-is).
 */
import type { ComparisonOp, Condition } from "./schema";

export type Rule = { field: string; op: ComparisonOp; value?: unknown };
export type RuleSet = { mode: "all" | "any"; rules: Rule[] };

export const OP_LABELS: Record<ComparisonOp, string> = {
  eq: "שווה ל", neq: "שונה מ", in: "אחד מ", notIn: "לא אחד מ", gt: "גדול מ", gte: "גדול או שווה ל",
  lt: "קטן מ", lte: "קטן או שווה ל", empty: "ריק", notEmpty: "מלא", contains: "מכיל", notContains: "לא מכיל",
};

export const OPS_WITHOUT_VALUE: ComparisonOp[] = ["empty", "notEmpty"];
export const needsValue = (op: ComparisonOp) => !OPS_WITHOUT_VALUE.includes(op);

const isLeaf = (c: Condition): c is Rule => "field" in c;

/** null = too complex for the visual editor. undefined condition = empty rule set. */
export function toRuleSet(cond: Condition | undefined): RuleSet | null {
  if (!cond) return { mode: "all", rules: [] };
  if (isLeaf(cond)) return { mode: "all", rules: [cond] };
  if ("all" in cond && cond.all.every(isLeaf)) return { mode: "all", rules: cond.all as Rule[] };
  if ("any" in cond && cond.any.every(isLeaf)) return { mode: "any", rules: cond.any as Rule[] };
  return null;
}

export function fromRuleSet(set: RuleSet): Condition | undefined {
  const rules = set.rules.filter((r) => r.field);
  if (rules.length === 0) return undefined;
  const clean = rules.map((r) => (needsValue(r.op) ? { field: r.field, op: r.op, value: r.value } : { field: r.field, op: r.op }));
  if (clean.length === 1) return clean[0];
  return set.mode === "any" ? { any: clean } : { all: clean };
}

/** Value typed in a text box → typed value for comparisons (numbers stay numbers, lists split by comma). */
export function coerceRuleValue(op: ComparisonOp, text: string): unknown {
  if (op === "in" || op === "notIn") return text.split(",").map((s) => s.trim()).filter(Boolean);
  if (text.trim() !== "" && !Number.isNaN(Number(text))) return Number(text);
  return text;
}
