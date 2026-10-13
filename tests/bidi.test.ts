import { describe, expect, it } from "vitest";
import {
  fontInputForRun,
  resolveDirection,
  splitVisualRuns,
  toVisual,
  wrapLogical,
} from "@/lib/pdf/bidi";
import { HEBREW_CASES } from "./hebrew-cases";

describe("toVisual (logical → visual order)", () => {
  for (const c of HEBREW_CASES.filter((c) => c.visual !== undefined)) {
    it(`${c.name}: ${c.text}`, () => {
      expect(toVisual(c.text)).toBe(c.visual);
    });
  }
});

describe("resolveDirection", () => {
  it("Hebrew anywhere → rtl", () => expect(resolveDirection("Gmail של")).toBe("rtl"));
  it("Latin only → ltr", () => expect(resolveDirection("Tel Aviv")).toBe("ltr"));
  it("numbers only → rtl", () => expect(resolveDirection("050-1234567")).toBe("rtl"));
  it("explicit wins", () => expect(resolveDirection("שלום", "ltr")).toBe("ltr"));
});

describe("runs", () => {
  it("splits Hebrew letters from other characters", () => {
    const runs = splitVisualRuns(toVisual("רחוב הרצל 12"));
    expect(runs.map((r) => [r.visual, r.hebrew])).toEqual([
      ["12 ", false],
      ["לצרה", true],
      [" ", false],
      ["בוחר", true],
    ]);
  });
  it("Hebrew runs are pre-reversed for the font, others untouched", () => {
    expect(fontInputForRun({ visual: "לצרה", hebrew: true })).toBe("הרצל");
    expect(fontInputForRun({ visual: "12 ", hebrew: false })).toBe("12 ");
  });
});

describe("wrapLogical", () => {
  const measure = (s: string) => s.length; // 1 unit per char
  it("wraps on word boundaries", () => {
    expect(wrapLogical("אחת שתיים שלוש ארבע", 9, measure)).toEqual(["אחת שתיים", "שלוש ארבע"]);
  });
  it("keeps explicit newlines", () => {
    expect(wrapLogical("שורה א\nשורה ב", 100, measure)).toEqual(["שורה א", "שורה ב"]);
  });
  it("never drops a long single word", () => {
    expect(wrapLogical("מילהארוכהמאוד קצר", 5, measure)).toEqual(["מילהארוכהמאוד", "קצר"]);
  });
});
