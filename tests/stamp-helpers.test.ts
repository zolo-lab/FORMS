import { describe, expect, it } from "vitest";
import { baselineY, combCells, formatStampDate, initialsOf, parseHexColor, targetPages } from "@/lib/pdf/stamp-helpers";

describe("stamp helpers", () => {
  it("formats dates in Israel time", () => {
    // 22:30 UTC on 31 Dec is already 1 Jan in Israel
    const d = new Date("2026-12-31T22:30:00Z");
    expect(formatStampDate(d)).toBe("01/01/2027");
    expect(formatStampDate(d, "dd.mm.yyyy")).toBe("01.01.2027");
    expect(formatStampDate(d, "yyyy-mm-dd")).toBe("2027-01-01");
  });

  it("builds initials", () => {
    expect(initialsOf("ישראל ישראלי")).toBe("י.י.");
    expect(initialsOf("  דנה בר-לב ")).toBe("ד.ב.ל.");
    expect(initialsOf("")).toBe("");
  });

  it("splits an ID into 9 cells left-to-right for digits", () => {
    const cells = combCells("123456789", 90, 9);
    expect(cells).toHaveLength(9);
    expect(cells[0]).toMatchObject({ char: "1", x: 0, width: 10 });
    expect(cells[8]).toMatchObject({ char: "9", x: 80 });
  });

  it("starts at the right for Hebrew text and drops surplus characters", () => {
    const cells = combCells("אבגדה", 50, 3);
    expect(cells.map((c) => c.char)).toEqual(["א", "ב", "ג"]);
    expect(cells[0]!.x).toBeCloseTo(100 / 3, 5);
    expect(cells[2]!.x).toBe(0);
  });

  it("defaults the cell count to the text length", () => {
    expect(combCells("12 34", 40)).toHaveLength(4);
  });

  it("parses hex colours", () => {
    expect(parseHexColor("#ff0000")).toMatchObject({ red: 1, green: 0, blue: 0 });
    expect(parseHexColor("nope")).toMatchObject({ red: 0, green: 0, blue: 0 });
  });

  it("computes baselines", () => {
    const box = { y: 100, height: 20 };
    expect(baselineY(box, 10, "bottom")).toBe(102);
    expect(baselineY(box, 10, "top")).toBeCloseTo(111.5);
    expect(baselineY(box, 10)).toBe(107);
  });

  it("lists target pages", () => {
    expect(targetPages(0, [1, 2, 2, 9, -1], 3)).toEqual([0, 1, 2]);
    expect(targetPages(1, undefined, 3)).toEqual([1]);
  });
});
