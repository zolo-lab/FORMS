import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { drawHebrew, embedHebrewFont, measureHebrew } from "@/lib/pdf/hebrew";
import { HEBREW_CASES } from "./hebrew-cases";

describe("drawHebrew", () => {
  it("draws every test case without throwing and produces a valid PDF", async () => {
    const doc = await PDFDocument.create();
    const font = await embedHebrewFont(doc);
    const page = doc.addPage([595, 842]);
    let y = 800;
    for (const c of HEBREW_CASES) {
      drawHebrew(page, c.text, { x: 300, y, width: 250, size: 11, font, multiline: true });
      y -= 24;
    }
    const bytes = await doc.save();
    expect(bytes.byteLength).toBeGreaterThan(1000);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it("shrinks single-line text to fit the box", async () => {
    const doc = await PDFDocument.create();
    const font = await embedHebrewFont(doc);
    const long = "שיבת ציון לרגבי אדמתה (ע\"ר) 580556306";
    expect(measureHebrew(long, font, 12)).toBeGreaterThan(100);
    const page = doc.addPage();
    expect(drawHebrew(page, long, { x: 0, y: 100, width: 100, size: 12, font })).toBe(1);
  });

  it("returns 0 for empty values", async () => {
    const doc = await PDFDocument.create();
    const font = await embedHebrewFont(doc);
    expect(drawHebrew(doc.addPage(), "  ", { x: 0, y: 0, width: 100, font })).toBe(0);
  });
});
