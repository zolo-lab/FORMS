import { describe, expect, it } from "vitest";
import { parseFormDefinition, findField, type FormDefinition } from "@/lib/forms/schema";
import { evaluateCondition } from "@/lib/forms/conditions";
import { validateAnswers } from "@/lib/forms/validate";
import {
  addDependent, dependentCandidates, dependentsOf, pickerText, removeDependent, resolvePicked, revealRule, revealWord, setDependents, visibilityDependsOn,
} from "@/lib/forms/dependents";

const def = (fields: unknown[]): FormDefinition =>
  parseFormDefinition({ schemaVersion: 1, title: "t", pages: [{ id: "p", title: "", fields }] }).data!;

// Form 101-like: a box opens two fields; a free-text answer opens a follow-up; a yes/no opens a table.
const form = def([
  { id: "resident", type: "consent", label: "אני תושב/ת קבע ביישוב מזכה" },
  { id: "fromDate", type: "date", label: "מתאריך", required: true },
  { id: "town", type: "short_text", label: "שם היישוב" },
  { id: "otherIncome", type: "short_text", label: "הכנסה נוספת ממקור" },
  { id: "otherIncomeAmount", type: "currency", label: "סכום ההכנסה הנוספת", required: true },
  { id: "hasKids", type: "yes_no", label: "יש לך ילדים?" },
  { id: "kids", type: "repeating_table", label: "ילדים", settings: { columns: [{ id: "name", type: "short_text", label: "שם" }] } },
  { id: "spouse", type: "short_text", label: "שם בן/בת הזוג" },
]);

describe("revealRule", () => {
  it("ticked box, 'yes', otherwise filled", () => {
    expect(revealRule(findField(form, "resident")!)).toEqual({ field: "resident", op: "eq", value: true });
    expect(revealRule(findField(form, "hasKids")!)).toEqual({ field: "hasKids", op: "eq", value: "yes" });
    expect(revealRule(findField(form, "otherIncome")!)).toEqual({ field: "otherIncome", op: "notEmpty" });
    expect(revealWord({ type: "consent" })).toBe("מסומן");
    expect(revealWord({ type: "short_text" })).toBe("מלא");
  });
});

describe("addDependent", () => {
  it("a box opens fields: hidden until ticked, shown when ticked", () => {
    let d = addDependent(form, "resident", "fromDate").def!;
    d = addDependent(d, "resident", "town").def!;
    expect(dependentsOf(d, "resident").map((f) => f.id)).toEqual(["fromDate", "town"]);
    const cond = findField(d, "fromDate")!.visibleIf;
    expect(evaluateCondition(cond, {})).toBe(false);
    expect(evaluateCondition(cond, { resident: false })).toBe(false);
    expect(evaluateCondition(cond, { resident: true })).toBe(true);
  });

  it("filling a text field opens the next one (iForms: אם השדה מולא – פתח)", () => {
    const d = addDependent(form, "otherIncome", "otherIncomeAmount").def!;
    const cond = findField(d, "otherIncomeAmount")!.visibleIf;
    expect(evaluateCondition(cond, { otherIncome: "" })).toBe(false);
    expect(evaluateCondition(cond, { otherIncome: "שכירות" })).toBe(true);
  });

  it("a hidden required field does not block sending; once shown it is required", () => {
    const d = addDependent(form, "otherIncome", "otherIncomeAmount").def!;
    const hidden = validateAnswers(d, { otherIncome: "" });
    expect(hidden.errors.otherIncomeAmount).toBeUndefined();
    const shown = validateAnswers(d, { otherIncome: "שכירות" });
    expect(shown.errors.otherIncomeAmount).toBeDefined();
  });

  it("an answer left in a field that got hidden is not kept", () => {
    const d = addDependent(form, "resident", "town").def!;
    const r = validateAnswers(d, { resident: false, town: "שדרות" });
    expect(r.cleaned.town).toBeUndefined();
  });

  it("yes/no opens a repeating table", () => {
    const d = addDependent(form, "hasKids", "kids").def!;
    expect(evaluateCondition(findField(d, "kids")!.visibleIf, { hasKids: "no" })).toBe(false);
    expect(evaluateCondition(findField(d, "kids")!.visibleIf, { hasKids: "yes" })).toBe(true);
  });

  it("keeps an existing AND condition of the target and adds to it", () => {
    const withCond = addDependent(form, "hasKids", "spouse").def!;
    const d = addDependent(withCond, "otherIncome", "spouse").def!;
    expect(findField(d, "spouse")!.visibleIf).toEqual({ all: [{ field: "hasKids", op: "eq", value: "yes" }, { field: "otherIncome", op: "notEmpty" }] });
  });

  it("adding the same link twice does not duplicate it", () => {
    const once = addDependent(form, "resident", "town").def!;
    const twice = addDependent(once, "resident", "town").def!;
    expect(findField(twice, "town")!.visibleIf).toEqual({ field: "resident", op: "eq", value: true });
  });

  it("refuses a loop, itself, unknown fields and an OR condition", () => {
    const a = addDependent(form, "resident", "town").def!;
    expect(addDependent(a, "town", "resident").error).toMatch(/מעגל/);
    expect(visibilityDependsOn(a, "town", "resident")).toBe(true);
    expect(addDependent(form, "town", "town").error).toBeDefined();
    expect(addDependent(form, "nope", "town").error).toBeDefined();
    const or = def([
      { id: "a", type: "short_text", label: "א" },
      { id: "b", type: "short_text", label: "ב" },
      { id: "c", type: "short_text", label: "ג", visibleIf: { any: [{ field: "a", op: "notEmpty" }, { field: "b", op: "notEmpty" }] } },
    ]);
    expect(addDependent(or, "a", "c").error).toMatch(/מורכב/);
  });
});

describe("removeDependent", () => {
  it("removes only the source's rule", () => {
    const d1 = addDependent(addDependent(form, "hasKids", "spouse").def!, "otherIncome", "spouse").def!;
    const d2 = removeDependent(d1, "hasKids", "spouse");
    expect(findField(d2, "spouse")!.visibleIf).toEqual({ field: "otherIncome", op: "notEmpty" });
    const d3 = removeDependent(d2, "otherIncome", "spouse");
    expect(findField(d3, "spouse")!.visibleIf).toBeUndefined();
    expect(dependentsOf(d3, "otherIncome")).toEqual([]);
  });
});

describe("pickers", () => {
  it("candidates exclude the source and what already depends on it", () => {
    const d = addDependent(form, "resident", "town").def!;
    const ids = dependentCandidates(d, "resident").map((f) => f.id);
    expect(ids).not.toContain("resident");
    expect(ids).not.toContain("town");
    expect(ids).toContain("fromDate");
  });
  it("resolves what the builder typed: picker text, id (any case) or a unique label", () => {
    const c = [
      { id: "fname", label: "שם פרטי" },
      { id: "fname1", label: "שם פרטי" },
      { id: "town", label: "שם היישוב" },
    ];
    expect(pickerText(c[0]!)).toBe("שם פרטי · fname");
    expect(resolvePicked(c, "שם פרטי · fname1")).toBe("fname1");
    expect(resolvePicked(c, " TOWN ")).toBe("town");
    expect(resolvePicked(c, "שם היישוב")).toBe("town");
    expect(resolvePicked(c, "שם פרטי")).toBeNull(); // two fields share it
    expect(resolvePicked(c, "")).toBeNull();
  });
});

describe("setDependents (mark on the form, then save)", () => {
  it("adds the newly marked, removes the unmarked, keeps the rest", () => {
    const start = addDependent(addDependent(form, "resident", "fromDate").def!, "resident", "spouse").def!;
    const r = setDependents(start, "resident", ["fromDate", "town", "resident"]);
    expect(dependentsOf(r.def, "resident").map((f) => f.id)).toEqual(["fromDate", "town"]);
    expect([r.added, r.removed, r.errors]).toEqual([1, 1, []]);
    expect(findField(r.def, "spouse")!.visibleIf).toBeUndefined();
  });
  it("skips a field that would make a loop and says why", () => {
    const start = addDependent(form, "resident", "town").def!;
    const r = setDependents(start, "town", ["resident", "fromDate"]);
    expect(r.added).toBe(1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/מעגל/);
  });
});
