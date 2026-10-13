import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/export/csv";
import { buildExportTable } from "@/lib/export/rows";
import { buildXlsx, columnName } from "@/lib/export/xlsx";
import { crc32, zipList, zipStore } from "@/lib/export/zip";
import { parseFormDefinition } from "@/lib/forms/schema";

describe("export", () => {
  it("crc32 matches the known value", () => {
    expect(crc32(new TextEncoder().encode("hello"))).toBe(0x3610a686);
  });

  it("writes a readable stored zip", () => {
    const zip = zipStore([
      { name: "a.txt", data: new TextEncoder().encode("hello") },
      { name: "תיקייה/ב.txt", data: new Uint8Array([1, 2, 3]) },
    ]);
    expect(zip[0]).toBe(0x50);
    expect(zipList(zip)).toEqual([
      { name: "a.txt", size: 5, crc: 0x3610a686 },
      { name: "תיקייה/ב.txt", size: 3, crc: crc32(new Uint8Array([1, 2, 3])) },
    ]);
  });

  it("quotes csv, keeps Hebrew and neutralises formulas", () => {
    const csv = toCsv([["שם", "הערה"], ["דנה, כהן", 'אמר "שלום"'], ["=SUM(A1)", "-5"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"דנה, כהן"');
    expect(csv).toContain('"אמר ""שלום"""');
    expect(csv).toContain("'=SUM(A1)");
    expect(csv).toContain(",-5");
  });

  it("names columns like a spreadsheet", () => {
    expect([0, 25, 26, 701, 702].map(columnName)).toEqual(["A", "Z", "AA", "ZZ", "AAA"]);
  });

  it("builds an xlsx with the expected parts", () => {
    const names = zipList(buildXlsx([["א", "ב"], ["1", ""]])).map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]));
  });

  it("builds a table with a column per export key", () => {
    const def = parseFormDefinition({
      schemaVersion: 1, title: "t",
      pages: [{ id: "p", title: "", fields: [
        { id: "firstName", type: "short_text", label: "שם", exportKey: "FNAME" },
        { id: "city", type: "short_text", label: "עיר" },
        { id: "sig", type: "signature", label: "חתימה" },
      ] }],
    }).data!;
    const mk = (id: string, name: string, answers: Record<string, unknown>) => ({
      id, subjectName: name, subjectIdNumber: "1", organization: "o", package: "p", status: "הושלם",
      createdAt: new Date("2026-10-13T10:00:00Z"), expiresAt: null, answers, definitions: [def],
    });
    const table = buildExportTable([mk("r1", "א", { firstName: "דנה", city: "חיפה" }), mk("r2", "ב", { firstName: "יוסי" })]);
    expect(table[0]!.slice(-2)).toEqual(["FNAME", "city"]);
    expect(table[1]!.slice(-2)).toEqual(["דנה", "חיפה"]);
    expect(table[2]!.slice(-2)).toEqual(["יוסי", ""]);
    expect(table[1]![6]).toBe("2026-10-13");
  });

  it("handles 500 rows", () => {
    const rows = Array.from({ length: 500 }, (_, i) => [String(i), "שם", "x"]);
    expect(toCsv(rows).split("\r\n")).toHaveLength(501);
    expect(zipList(buildXlsx(rows)).length).toBeGreaterThan(3);
  });
});
