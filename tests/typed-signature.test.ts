import { describe, expect, it } from "vitest";
import { fitFontSize, initialsOf } from "@/lib/pdf/typed-signature";

describe("initialsOf", () => {
  it("takes the first letter of each word", () => {
    expect(initialsOf("ישראל זולו")).toBe("יז");
    expect(initialsOf("  דנה   כהן לוי ")).toBe("דכל");
  });
  it("splits hyphenated names and ignores punctuation", () => {
    expect(initialsOf("בן-דוד מירב")).toBe("בדמ");
    expect(initialsOf('ד"ר כהן')).toBe("דכ");
  });
  it("uppercases Latin letters", () => {
    expect(initialsOf("john smith")).toBe("JS");
  });
  it("returns an empty string for blanks", () => {
    expect(initialsOf("   ")).toBe("");
  });
});

describe("fitFontSize", () => {
  const measure = (size: number, text: string) => text.length * size * 0.5;
  it("keeps the preferred size when the text fits", () => {
    expect(fitFontSize("אבג", 100, 80, measure)).toBe(80);
  });
  it("shrinks until the text fits", () => {
    const s = fitFontSize("a".repeat(40), 200, 80, measure);
    expect(measure(s, "a".repeat(40))).toBeLessThanOrEqual(200);
    expect(s).toBeLessThan(80);
  });
  it("never goes below the minimum", () => {
    expect(fitFontSize("a".repeat(1000), 100, 80, measure, 16)).toBe(16);
  });
});
