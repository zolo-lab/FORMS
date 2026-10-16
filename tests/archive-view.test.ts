import { describe, expect, it } from "vitest";
import { archiveView } from "@/lib/export/archive-view";

const table = [
  ["id", "שם", "A", "B", "C"],
  ["1", "דנה", "x", "", "7"],
  ["2", "אבי", "", "", "8"],
  ["3", "גל", "y", "", ""],
];

describe("archiveView", () => {
  it("drops field columns that are empty in every row, keeps the fixed ones", () => {
    const v = archiveView(table, 10, 2);
    expect(v.headers).toEqual(["id", "שם", "A", "C"]);
    expect(v.rows[0]).toEqual(["1", "דנה", "x", "7"]);
  });
  it("keeps an empty fixed column", () => {
    const v = archiveView([["id", "ת\"ז", "A"], ["1", "", "z"]], 10, 2);
    expect(v.headers).toEqual(["id", "ת\"ז", "A"]);
  });
  it("cuts the rows and says so", () => {
    const v = archiveView(table, 2, 2);
    expect(v.rows).toHaveLength(2);
    expect(v.total).toBe(3);
    expect(v.truncated).toBe(true);
  });
  it("copes with no requests", () => {
    const v = archiveView([["id", "שם"]], 10, 2);
    expect(v).toEqual({ headers: ["id", "שם"], rows: [], total: 0, truncated: false });
    expect(archiveView([]).headers).toEqual([]);
  });
});
