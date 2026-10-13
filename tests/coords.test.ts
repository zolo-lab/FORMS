import { describe, expect, it } from "vitest";
import { clampBox, pdfBoxToScreen, screenBoxToPdf } from "@/lib/pdf/coords";

describe("pdf coordinates", () => {
  const H = 842; // A4 height in points
  it("flips the y axis and applies scale", () => {
    // A box 100pt wide, 20pt tall whose bottom-left is at (50, 700).
    expect(pdfBoxToScreen({ x: 50, y: 700, width: 100, height: 20 }, H, 1.5)).toEqual({ x: 75, y: (842 - 720) * 1.5, width: 150, height: 30 });
  });
  it("round-trips for several scales", () => {
    for (const scale of [0.5, 1, 1.33, 2]) {
      const pdf = { x: 12.5, y: 300.25, width: 80, height: 14 };
      const back = screenBoxToPdf(pdfBoxToScreen(pdf, H, scale), H, scale);
      expect(back.x).toBeCloseTo(pdf.x, 6);
      expect(back.y).toBeCloseTo(pdf.y, 6);
      expect(back.width).toBeCloseTo(pdf.width, 6);
      expect(back.height).toBeCloseTo(pdf.height, 6);
    }
  });
  it("top-left screen corner maps to the top of the page", () => {
    const pdf = screenBoxToPdf({ x: 0, y: 0, width: 100, height: 20 }, H, 1);
    expect(pdf.y).toBe(H - 20);
  });
  it("clamps into the page with a minimum size", () => {
    expect(clampBox({ x: -5, y: 900, width: 2, height: 2 }, 595, 842)).toEqual({ x: 0, y: 836, width: 6, height: 6 });
    expect(clampBox({ x: 590, y: 10, width: 50, height: 20 }, 595, 842)).toEqual({ x: 545, y: 10, width: 50, height: 20 });
  });
});
