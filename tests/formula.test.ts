import { describe, expect, it } from "vitest";
import { evaluateFormula, formulaRefs, parseFormula } from "@/lib/forms/formula";

const ev = (src: string, answers: Record<string, unknown> = {}, today = "2026-10-13") => evaluateFormula(src, { answers, today });

describe("formula", () => {
  it("respects operator precedence and parentheses", () => {
    expect(ev("2 + 3 * 4")).toBe(14);
    expect(ev("(2 + 3) * 4")).toBe(20);
    expect(ev("10 - 4 - 3")).toBe(3);
    expect(ev("-2 * 3")).toBe(-6);
    expect(ev("10 % 4")).toBe(2);
  });

  it("reads fields and treats empty as 0 in arithmetic", () => {
    expect(ev("{a} * {b}", { a: 3, b: "4" })).toBe(12);
    expect(ev("{a} + {b}", { a: 5 })).toBe(5);
    expect(ev("{a} + {b}", {})).toBe(null);
  });

  it("a product with an empty factor is empty, not 0", () => {
    expect(ev("{a} * 2", {})).toBe(null);
    expect(ev("{a} * {b}", { a: 3 })).toBe(null);
    expect(ev("{a} * 2", { a: 0 })).toBe(0);
  });

  it("division by zero or empty gives empty", () => {
    expect(ev("{a} / {b}", { a: 5, b: 0 })).toBe(null);
    expect(ev("{a} / {b}", { a: 5 })).toBe(null);
    expect(ev("{a} / {b}", { a: 10, b: 4 })).toBe(2.5);
  });

  it("aggregates table columns", () => {
    const answers = { children: [{ amount: 100 }, { amount: "250.5" }, {}] };
    expect(ev("sum({children.amount})", answers)).toBe(350.5);
    expect(ev("avg({children.amount})", answers)).toBe(175.25);
    expect(ev("count({children.amount})", answers)).toBe(2);
    expect(ev("max({children.amount})", answers)).toBe(250.5);
    expect(ev("{children}", answers)).toBe(3);
    expect(ev("sum({children.amount}, 10)", answers)).toBe(360.5);
  });

  it("computes age on a given day", () => {
    expect(ev("age({birthDate})", { birthDate: "1990-10-13" })).toBe(36);
    expect(ev("age({birthDate})", { birthDate: "1990-10-14" })).toBe(35);
    expect(ev("age({birthDate})", {})).toBe(null);
  });

  it("supports if, comparisons, logic, strings", () => {
    expect(ev('if({income} > 5000, "high", "low")', { income: 6000 })).toBe("high");
    expect(ev('if({income} > 5000, "high", "low")', { income: "100" })).toBe("low");
    expect(ev('if({a} = "x" && {b} >= 2, 1, 0)', { a: "x", b: 2 })).toBe(1);
    expect(ev('concat({first}, " ", {last})', { first: "דנה", last: "כהן" })).toBe("דנה כהן");
    expect(ev("round(10 / 3, 2)")).toBe(3.33);
    expect(ev("isempty({x})")).toBe(true);
  });

  it("avoids float noise", () => {
    expect(ev("0.1 + 0.2")).toBe(0.3);
  });

  it("reports syntax errors for the builder and never throws when evaluating", () => {
    expect(parseFormula("2 +")).toMatchObject({ ok: false });
    expect(parseFormula("nope(1)")).toMatchObject({ ok: false, error: expect.stringContaining("nope") });
    expect(parseFormula("{a")).toMatchObject({ ok: false });
    expect(parseFormula("")).toMatchObject({ ok: false });
    expect(ev("2 +")).toBe(null);
    expect(ev("1 2")).toBe(null);
  });

  it("lists referenced fields", () => {
    const p = parseFormula("{a} + sum({rows.x}) * {b}");
    expect(p.ok && formulaRefs(p.ast).sort()).toEqual(["a", "b", "rows"]);
  });
});
