import { describe, expect, it } from "vitest";
import { parseFormDefinition } from "@/lib/forms/schema";
import { validateAnswers } from "@/lib/forms/validate";
import { dropBlankRows, isBlankRow, isSpareRow, setRowCell, trimTrailingBlankRows, visibleRowCount } from "@/lib/forms/rows";

const today = "2026-11-02";
const auto = { settings: {} };
const manual = { settings: { autoRows: false } };

describe("auto rows of a repeating table", () => {
  it("shows one empty row to start with, and one more after every filled row", () => {
    expect(visibleRowCount(auto, [])).toBe(1);
    expect(visibleRowCount(auto, [{ name: "נועה" }])).toBe(2);
    expect(visibleRowCount(auto, [{ name: "נועה" }, { name: "איתי" }])).toBe(3);
  });

  it("respects the minimum and the maximum", () => {
    // A required first row is that single row; the next appears once it is started.
    expect(visibleRowCount({ settings: { minRows: 1 } }, [])).toBe(1);
    expect(visibleRowCount({ settings: { minRows: 1 } }, [{}])).toBe(1);
    expect(visibleRowCount({ settings: { minRows: 1 } }, [{ a: 1 }])).toBe(2);
    expect(visibleRowCount({ settings: { minRows: 2 } }, [])).toBe(2);
    expect(visibleRowCount({ settings: { maxRows: 2 } }, [{ a: 1 }, { a: 2 }])).toBe(2);
    expect(visibleRowCount({ settings: { maxRows: 1 } }, [])).toBe(1);
  });

  it("marks only the empty row past the required ones as optional", () => {
    expect(isSpareRow(auto, [], 0)).toBe(true);
    expect(isSpareRow({ settings: { minRows: 1 } }, [], 0)).toBe(false);
    expect(isSpareRow({ settings: { minRows: 1 } }, [{ a: 1 }], 1)).toBe(true);
    expect(isSpareRow(manual, [], 0)).toBe(false);
  });

  it("without auto rows shows only the stored rows", () => {
    expect(visibleRowCount(manual, [])).toBe(0);
    expect(visibleRowCount(manual, [{ a: 1 }])).toBe(1);
  });

  it("typing in the empty row makes it a real row", () => {
    expect(setRowCell(auto, [], 0, "name", "נ")).toEqual([{ name: "נ" }]);
    expect(setRowCell(auto, [{ name: "נועה" }], 1, "name", "א")).toEqual([{ name: "נועה" }, { name: "א" }]);
  });

  it("clearing the last row turns it back into the empty row", () => {
    const rows = [{ name: "נועה" }, { name: "א" }];
    expect(setRowCell(auto, rows, 1, "name", "")).toEqual([{ name: "נועה" }]);
  });

  it("clearing a middle row keeps it in place so the rows below do not jump", () => {
    const rows = [{ name: "נועה" }, { name: "איתי" }, { name: "רון" }];
    expect(setRowCell(auto, rows, 1, "name", "")).toHaveLength(3);
  });

  it("treats empty strings, unticked boxes and empty composites as empty", () => {
    expect(isBlankRow({})).toBe(true);
    expect(isBlankRow({ name: " ", custody: false, addr: { city: "" } })).toBe(true);
    expect(isBlankRow({ count: 0 })).toBe(false);
    expect(isBlankRow({ custody: true })).toBe(false);
  });

  it("trims empty rows only at the end, never below the minimum", () => {
    expect(trimTrailingBlankRows([{ a: 1 }, {}, {}])).toEqual([{ a: 1 }]);
    expect(trimTrailingBlankRows([{}, {}], 1)).toEqual([{}]);
    expect(dropBlankRows(auto, [{}, { a: 1 }, {}])).toEqual([{ a: 1 }]);
    expect(dropBlankRows(manual, [{}, { a: 1 }])).toEqual([{}, { a: 1 }]);
  });
});

describe("validating an auto-rows table", () => {
  const def = parseFormDefinition({
    schemaVersion: 1, title: "t",
    pages: [{ id: "p", title: "", fields: [
      { id: "kids", type: "repeating_table", label: "ילדים", settings: { rowLabel: "ילד" }, fields: [
        { id: "name", type: "short_text", label: "שם", required: true },
        { id: "birth", type: "date", label: "תאריך לידה", required: true },
      ] },
    ] }],
  }).data!;

  it("an empty last row is not an error and is not stored", () => {
    const r = validateAnswers(def, { kids: [{ name: "נועה", birth: "2020-01-01" }, {}] }, { today });
    expect(r.ok).toBe(true);
    expect(r.cleaned.kids).toEqual([{ name: "נועה", birth: "2020-01-01" }]);
  });

  it("a table left completely empty is fine when not required", () => {
    const r = validateAnswers(def, { kids: [{}] }, { today });
    expect(r.ok).toBe(true);
  });

  it("a started row still needs its required cells, on the row the filler sees", () => {
    const r = validateAnswers(def, { kids: [{}, { name: "איתי" }] }, { today });
    expect(r.ok).toBe(false);
    expect(r.errors["kids.1.birth"]).toBeDefined();
    expect(r.errors["kids.0.name"]).toBeUndefined();
  });

  it("counts only filled rows against the minimum", () => {
    const min = parseFormDefinition({
      schemaVersion: 1, title: "t",
      pages: [{ id: "p", title: "", fields: [
        { id: "kids", type: "repeating_table", label: "ילדים", settings: { minRows: 1 }, fields: [{ id: "name", type: "short_text", label: "שם" }] },
      ] }],
    }).data!;
    expect(validateAnswers(min, { kids: [{}] }, { today }).errors.kids).toBeDefined();
    expect(validateAnswers(min, { kids: [{ name: "נועה" }, {}] }, { today }).ok).toBe(true);
  });
});
