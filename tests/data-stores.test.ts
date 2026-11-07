import { describe, expect, it } from "vitest";
import { cleanRows, cleanValues, exportRows, highestKey, nextColumnKey, normalizeColumns, planImport, rowLabel, type StoreColumn } from "@/lib/stores/model";

const cols: StoreColumn[] = [
  { key: "c1", label: "שם ספק" },
  { key: "c2", label: 'ח"פ' },
  { key: "c4", label: "כתובת" },
];

describe("columns", () => {
  it("mints keys above every key ever used", () => {
    expect(nextColumnKey(cols)).toBe("c5");
    expect(nextColumnKey(cols, 9)).toBe("c10");
    expect(nextColumnKey([])).toBe("c1");
  });

  it("keeps existing keys, mints new ones, drops empty and duplicate labels", () => {
    const out = normalizeColumns(
      [{ key: "c2", label: ' ח"פ ' }, { label: "טלפון" }, { label: "" }, { key: "c1", label: "שם ספק" }, { label: "טלפון" }, { key: "zzz", label: "בנק" }],
      cols,
    );
    expect(out).toEqual([
      { key: "c2", label: 'ח"פ' },
      { key: "c5", label: "טלפון" },
      { key: "c1", label: "שם ספק" },
      { key: "c6", label: "בנק" },
    ]);
  });

  it("never gives a deleted column's key to a new column", () => {
    const after = normalizeColumns([{ key: "c1", label: "שם ספק" }, { label: "חדש" }], cols, highestKey(cols));
    expect(after[1]!.key).toBe("c5");
  });

  it("a key cannot be claimed twice", () => {
    const out = normalizeColumns([{ key: "c1", label: "א" }, { key: "c1", label: "ב" }], cols);
    expect(out.map((c) => c.key)).toEqual(["c1", "c5"]);
  });
});

describe("rows", () => {
  it("keeps known columns only, trims, drops empties", () => {
    expect(cleanValues({ c1: "  ספק  א ", c2: "", c9: "x", c4: 5 }, cols)).toEqual({ c1: "ספק א" });
  });

  it("drops fully empty rows and keeps valid ids", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    expect(cleanRows([{ id, values: { c1: "א" } }, { values: { c2: " " } }, { id: "bad", values: { c2: "1" } }, "junk"], cols)).toEqual([
      { id, values: { c1: "א" } },
      { values: { c2: "1" } },
    ]);
    expect(cleanRows("nope", cols)).toEqual([]);
  });

  it("labels a row by its display column, else its first value", () => {
    expect(rowLabel({ c1: "ספק", c2: "51" }, cols, "c2")).toBe("51");
    expect(rowLabel({ c2: "51" }, cols, "c1")).toBe("51");
    expect(rowLabel({}, cols, "c1")).toBe("");
  });
});

describe("import and export", () => {
  it("matches headers to labels ignoring quotes, spaces and case, and reports unknown headers", () => {
    const plan = planImport(
      [
        ["כתובת", "שם  ספק", "חפ", "Notes"],
        ["הרצל 1", "ספק א", "511111111", "x"],
        ["", "", "", "only notes"],
        ["", "ספק ב", "", ""],
      ],
      cols,
    );
    expect(plan.mapping).toEqual({ c4: 0, c1: 1, c2: 2 });
    expect(plan.unknownHeaders).toEqual(["Notes"]);
    expect(plan.rows).toEqual([{ c4: "הרצל 1", c1: "ספק א", c2: "511111111" }, { c1: "ספק ב" }]);
  });

  it("an empty sheet plans nothing", () => {
    expect(planImport([], cols)).toEqual({ mapping: {}, unknownHeaders: [], rows: [] });
  });

  it("exports labels then values in column order, and round-trips through import", () => {
    const sheet = exportRows(cols, [{ values: { c1: "ספק א", c4: "הרצל 1" } }]);
    expect(sheet).toEqual([["שם ספק", 'ח"פ', "כתובת"], ["ספק א", "", "הרצל 1"]]);
    expect(planImport(sheet, cols).rows).toEqual([{ c1: "ספק א", c4: "הרצל 1" }]);
  });
});
