import { describe, expect, it } from "vitest";
import { buildXlsx } from "@/lib/export/xlsx";
import { toCsv } from "@/lib/export/csv";
import { parseCsv, parseSheet, parseXlsx, columnIndex } from "@/lib/import/sheet";
import { zipStore } from "@/lib/export/zip";
import { deflateRawSync } from "node:zlib";
import { unzip } from "@/lib/import/unzip";

const rows = [
  ["שם", "מייל", "טלפון", "הערה"],
  ["דנה כהן", "dana@example.org", "050-1234567", 'עם "מרכאות" & <סימנים>'],
  ["אבי לוי", "", "0521234567", ""],
];

describe("xlsx round trip", () => {
  it("reads back what our writer wrote (inline strings, Hebrew, escapes, empty cells)", () => {
    expect(parseXlsx(buildXlsx(rows))).toEqual(rows);
  });
  it("parseSheet detects XLSX by signature", () => {
    expect(parseSheet(buildXlsx(rows))).toEqual(rows);
  });
});

describe("xlsx written by Excel (shared strings, deflate, numbers, gaps)", () => {
  it("handles shared strings, numeric cells and skipped columns", () => {
    const enc = new TextEncoder();
    const parts: Record<string, string> = {
      "xl/workbook.xml": `<workbook xmlns:r="x"><sheets><sheet name="Data" sheetId="1" r:id="rId7"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId7" Type="t" Target="worksheets/sheet3.xml"/></Relationships>`,
      "xl/sharedStrings.xml": `<sst><si><t>שם</t></si><si><r><t>דנה </t></r><r><t>כהן</t></r></si><si><t>טלפון</t></si></sst>`,
      "xl/worksheets/sheet3.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="C2"><v>501234567</v></c></row></sheetData></worksheet>`,
    };
    // Deflate-compress the parts, as Excel does: build a zip by hand around zipStore's directory is overkill,
    // so store one part deflated through a tiny custom zip.
    const stored = zipStore(Object.entries(parts).map(([name, xml]) => ({ name, data: enc.encode(xml) })));
    expect(parseXlsx(stored)).toEqual([["שם", "", "טלפון"], ["דנה כהן", "", "501234567"]]);
    // And the deflate path of the reader.
    const raw = enc.encode("hello hello hello");
    const entries = unzip(buildDeflatedZip("a.txt", raw));
    expect(new TextDecoder().decode(entries.get("a.txt")!)).toBe("hello hello hello");
  });
});

function buildDeflatedZip(name: string, data: Uint8Array): Uint8Array {
  const comp = deflateRawSync(data);
  const nameB = new TextEncoder().encode(name);
  const local = new DataView(new ArrayBuffer(30));
  local.setUint32(0, 0x04034b50, true);
  local.setUint16(8, 8, true);
  local.setUint32(18, comp.length, true);
  local.setUint32(22, data.length, true);
  local.setUint16(26, nameB.length, true);
  const cd = new DataView(new ArrayBuffer(46));
  cd.setUint32(0, 0x02014b50, true);
  cd.setUint16(10, 8, true);
  cd.setUint32(20, comp.length, true);
  cd.setUint32(24, data.length, true);
  cd.setUint16(28, nameB.length, true);
  cd.setUint32(42, 0, true);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, 1, true);
  end.setUint16(10, 1, true);
  end.setUint32(12, 46 + nameB.length, true);
  end.setUint32(16, 30 + nameB.length + comp.length, true);
  return Buffer.concat([new Uint8Array(local.buffer), nameB, comp, new Uint8Array(cd.buffer), nameB, new Uint8Array(end.buffer)]);
}

describe("csv", () => {
  it("round trips our own writer, including quotes and newlines in cells", () => {
    const tricky = [["a", "b"], ['x "y"', "line1\nline2"], ["1,5", ""]];
    expect(parseCsv(toCsv(tricky))).toEqual(tricky);
  });
  it("detects semicolons (Excel in Hebrew locale) and strips the BOM", () => {
    expect(parseCsv("﻿שם;מייל\r\nדנה;d@x.org\r\n")).toEqual([["שם", "מייל"], ["דנה", "d@x.org"]]);
  });
  it("ignores empty trailing rows and columns", () => {
    expect(parseCsv("a,b,\n1,2,\n,,\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("columnIndex", () => {
  it("maps references", () => {
    expect(columnIndex("A1")).toBe(0);
    expect(columnIndex("Z9")).toBe(25);
    expect(columnIndex("AA10")).toBe(26);
  });
});
