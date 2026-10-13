import { describe, expect, it } from "vitest";
import { fieldIsRequired, nextPageIndex, prevPageIndex, validatePage, visiblePageIndexes } from "@/lib/forms/wizard";
import { sampleForm, validAnswers } from "./fixtures/sample-form";

const today = "2026-10-13";

describe("wizard", () => {
  it("lists visible pages and navigates between them", () => {
    const form = structuredClone(sampleForm);
    form.pages[1]!.visibleIf = { field: "hasChildren", op: "eq", value: "yes" };
    expect(visiblePageIndexes(form, { hasChildren: "no" })).toEqual([0]);
    expect(visiblePageIndexes(form, { hasChildren: "yes" })).toEqual([0, 1]);
    expect(nextPageIndex(form, { hasChildren: "yes" }, 0)).toBe(1);
    expect(nextPageIndex(form, { hasChildren: "no" }, 0)).toBeNull();
    expect(prevPageIndex(form, { hasChildren: "yes" }, 1)).toBe(0);
    expect(prevPageIndex(form, { hasChildren: "yes" }, 0)).toBeNull();
  });

  it("validates only the fields of the given page", () => {
    const errors = validatePage(sampleForm, {}, 0, { today });
    expect(errors.firstName).toBe("שדה חובה");
    expect(errors.salary).toBeUndefined(); // page 2 field
  });

  it("passes a fully valid page", () => {
    expect(validatePage(sampleForm, validAnswers, 0, { today })).toEqual({});
  });

  it("keeps nested table errors under the table's page", () => {
    const answers = { ...validAnswers, hasChildren: "yes", children: [{ name: "" }] };
    const errors = validatePage(sampleForm, answers, 0, { today });
    expect(Object.keys(errors).some((k) => k.startsWith("children."))).toBe(true);
  });

  it("computes the required star including requiredIf", () => {
    const spouse = sampleForm.pages[0]!.fields.find((f) => f.id === "spouseName")!;
    expect(fieldIsRequired(spouse, { maritalStatus: "married" })).toBe(true);
    expect(fieldIsRequired(spouse, { maritalStatus: "single" })).toBe(false);
    const first = sampleForm.pages[0]!.fields.find((f) => f.id === "firstName")!;
    expect(fieldIsRequired(first, {})).toBe(true);
  });
});
