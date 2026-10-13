import { describe, expect, it } from "vitest";
import { parseFormDefinition } from "@/lib/forms/schema";
import { validateAnswers } from "@/lib/forms/validate";
import { fieldIsRequired, nextPageIndex, prevPageIndex, reachedPageIndexes, validatePage, visiblePageIndexes } from "@/lib/forms/wizard";
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

describe("page jumps and locked fields", () => {
  const def = parseFormDefinition({
    schemaVersion: 1,
    title: "t",
    pages: [
      { id: "a", title: "א", nextPage: [{ if: { field: "hasKids", op: "eq", value: "no" }, goTo: "c" }, { if: { field: "stop", op: "eq", value: "yes" }, goTo: "end" }], fields: [
        { id: "hasKids", type: "yes_no", label: "ילדים?", required: true },
        { id: "stop", type: "yes_no", label: "לעצור?" },
      ] },
      { id: "b", title: "ב", fields: [{ id: "kidName", type: "short_text", label: "שם ילד", required: true }] },
      { id: "c", title: "ג", fields: [
        { id: "note", type: "short_text", label: "הערה" },
        { id: "locked", type: "short_text", label: "נעול", required: true, disabledIf: { field: "note", op: "eq", value: "skip" } },
      ] },
    ],
  }).data!;

  it("follows the first matching jump, else the next page", () => {
    expect(nextPageIndex(def, { hasKids: "no" }, 0)).toBe(2);
    expect(nextPageIndex(def, { hasKids: "yes" }, 0)).toBe(1);
    expect(nextPageIndex(def, { hasKids: "yes", stop: "yes" }, 0)).toBeNull();
    expect(nextPageIndex(def, { hasKids: "no", stop: "yes" }, 0)).toBe(2);
    expect(reachedPageIndexes(def, { hasKids: "no" })).toEqual([0, 2]);
    expect(reachedPageIndexes(def, { hasKids: "yes" })).toEqual([0, 1, 2]);
  });

  it("goes back along the path actually taken", () => {
    expect(prevPageIndex(def, { hasKids: "no" }, 2)).toBe(0);
    expect(prevPageIndex(def, { hasKids: "yes" }, 2)).toBe(1);
  });

  it("does not validate or store skipped pages", () => {
    const r = validateAnswers(def, { hasKids: "no", kidName: "דנה", locked: "x" }, { today: "2026-10-13" });
    expect(r.errors.kidName).toBeUndefined();
    expect(r.cleaned.kidName).toBeUndefined();
    const full = validateAnswers(def, { hasKids: "yes", locked: "x" }, { today: "2026-10-13" });
    expect(full.errors.kidName).toBe("שדה חובה");
  });

  it("ignores a locked field entirely", () => {
    const r = validateAnswers(def, { hasKids: "no", note: "skip" }, { today: "2026-10-13" });
    expect(r.errors.locked).toBeUndefined();
    expect(r.cleaned.locked).toBeUndefined();
    expect(validateAnswers(def, { hasKids: "no" }, { today: "2026-10-13" }).errors.locked).toBe("שדה חובה");
  });
});
