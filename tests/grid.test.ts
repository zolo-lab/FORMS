import { describe, expect, it } from "vitest";
import { formatGrid, validateGrid } from "@/lib/forms/grid";
import { FIELD_TYPES } from "@/lib/forms/field-types";
import { parseFormDefinition } from "@/lib/forms/schema";
import { validateAnswers } from "@/lib/forms/validate";

const field = {
  id: "g",
  type: "grid" as const,
  label: "שעות",
  settings: {
    rows: [{ value: "sun", label: "ראשון" }, { value: "mon", label: "שני" }],
    columns: [
      { value: "from", label: "מ", type: "date" },
      { value: "hours", label: "שעות", type: "number" },
      { value: "kind", label: "סוג", type: "dropdown", options: [{ value: "a", label: "רגיל" }, { value: "b", label: "נוסף" }] },
      { value: "note", label: "הערה" },
    ],
  },
};

describe("grid field", () => {
  it("is a registered type", () => {
    expect(FIELD_TYPES).toContain("grid");
  });

  it("cleans typed cells: numbers as numbers, blanks dropped", () => {
    const r = validateGrid(field, { sun: { from: "2026-01-01", hours: "8", kind: "a", note: "" }, mon: {} });
    expect(r.error).toBeNull();
    expect(r.cleaned).toEqual({ sun: { from: "2026-01-01", hours: 8, kind: "a" } });
  });

  it("rejects a bad number, a bad date and a value outside the list", () => {
    expect(validateGrid(field, { sun: { hours: "x" } }).error).toMatch(/מספר/);
    expect(validateGrid(field, { sun: { from: "1.1.2026" } }).error).toMatch(/תאריך/);
    expect(validateGrid(field, { sun: { kind: "zzz" } }).error).toMatch(/רשימה/);
  });

  it("required means every cell", () => {
    const req = { ...field, required: true };
    expect(validateGrid(req, { sun: { from: "2026-01-01", hours: "1", kind: "a", note: "x" } }).error).toMatch(/שני/);
  });

  it("goes through validateAnswers and formats as one line", () => {
    const def = parseFormDefinition({ schemaVersion: 1, title: "t", pages: [{ id: "p", title: "", fields: [field] }] }).data!;
    const v = validateAnswers(def, { g: { sun: { hours: "8", kind: "b" } } });
    expect(v.ok).toBe(true);
    expect(v.cleaned.g).toEqual({ sun: { hours: 8, kind: "b" } });
    expect(formatGrid(field, v.cleaned.g)).toBe("ראשון: שעות=8, סוג=נוסף");
  });
});
