import { describe, expect, it } from "vitest";
import { formatPages, overlappingParts, parsePages, uncoveredPages } from "@/lib/processing/pages";

const pages = (spec: string, count?: number) => parsePages(spec, count).pages;

describe("parsePages", () => {
  it("reads single pages, ranges and lists", () => {
    expect(pages("1")).toEqual([1]);
    expect(pages("1-3")).toEqual([1, 2, 3]);
    expect(pages("1-2,5")).toEqual([1, 2, 5]);
    expect(pages("5,1-2")).toEqual([1, 2, 5]);
  });

  it("tolerates spaces and trailing commas", () => {
    expect(pages(" 1 - 3 , 5 ,")).toEqual([1, 2, 3, 5]);
  });

  it("resolves an open range against the document's length", () => {
    expect(pages("3-", 5)).toEqual([3, 4, 5]);
    expect(parsePages("3-").errors[0]).toContain("עד הסוף");
  });

  it("returns each page once and says so", () => {
    const r = parsePages("1-3,2");
    expect(r.pages).toEqual([1, 2, 3]);
    expect(r.errors).toEqual([]);
    expect(r.warnings[0]).toContain("יותר מפעם אחת");
  });

  it("refuses a page outside the document", () => {
    expect(parsePages("4", 3).errors[0]).toContain("3 עמודים");
    expect(parsePages("1-9", 3).errors[0]).toContain("3 עמודים");
    expect(parsePages("4", 3).pages).toEqual([]);
  });

  it("refuses nonsense instead of guessing", () => {
    expect(parsePages("abc").errors[0]).toContain("לא מספר עמוד");
    expect(parsePages("0").errors[0]).toContain("מתחילים ב-1");
    expect(parsePages("5-2").errors[0]).toContain("הפוך");
    expect(parsePages("").errors[0]).toBe("לא נבחרו עמודים");
    expect(parsePages("   ").errors[0]).toBe("לא נבחרו עמודים");
  });

  it("keeps the good pages of a spec whose other piece is broken", () => {
    const r = parsePages("1-2,oops", 5);
    expect(r.pages).toEqual([1, 2]);
    expect(r.errors).toHaveLength(1);
  });

  it("never returns pages when it also reports the spec is empty", () => {
    const r = parsePages(",,,");
    expect(r.pages).toEqual([]);
    expect(r.errors).toEqual(["לא נבחרו עמודים"]);
  });
});

describe("formatPages", () => {
  it("writes runs as ranges", () => {
    expect(formatPages([1, 2, 3, 7])).toBe("1-3,7");
    expect(formatPages([2])).toBe("2");
    expect(formatPages([])).toBe("");
    expect(formatPages([3, 1, 2])).toBe("1-3");
    expect(formatPages([1, 1, 2])).toBe("1-2");
  });

  it("round-trips with parsePages", () => {
    for (const spec of ["1", "1-3", "1-2,5", "2,4,6"]) {
      expect(formatPages(pages(spec))).toBe(spec);
    }
  });
});

describe("what the builder is warned about", () => {
  it("lists pages no part takes", () => {
    expect(uncoveredPages(["1-2"], 4)).toEqual([3, 4]);
    expect(uncoveredPages(["1-2", "3-4"], 4)).toEqual([]);
    expect(uncoveredPages([], 2)).toEqual([1, 2]);
  });

  it("finds parts that claim the same page", () => {
    expect(overlappingParts(["1-2", "2-3"])).toEqual([[0, 1]]);
    expect(overlappingParts(["1", "2", "3"])).toEqual([]);
    expect(overlappingParts(["1-3", "2", "3"])).toEqual([[0, 1], [0, 2]]);
  });
});
