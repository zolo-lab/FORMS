/**
 * The detection test bank (tests/detection): every layout pattern is drawn as a real PDF, read the way the PDF tab
 * reads it, detected, and scored against its known answer. Any change to detection that loses a field, gets a type or
 * the options wrong, or invents a field fails here. Run `pnpm tsx scripts/detect-score.ts` for the readable board.
 */
import { describe, expect, it } from "vitest";
import form101 from "./fixtures/form101-pages.json";
import { detectFields } from "@/lib/pdf/detect";
import { describeProblem, scoreDetection } from "@/lib/pdf/detect-eval";
import type { GuessPage } from "@/lib/pdf/guess";
import { CASES } from "./detection/forms";
import { pageData } from "./detection/extract";
import { FORM101_EXPECTED, FORM101_NOT_FIELDS, FORM101_REGIONS } from "./detection/form101-expected";

describe("detection test bank", () => {
  for (const [name, make] of Object.entries(CASES)) {
    it(name, async () => {
      const f = await make();
      const s = scoreDetection(detectFields(await pageData(f.bytes)), f.expected, f.notFields);
      expect(s.problems.map(describeProblem), f.pattern).toEqual([]);
      expect(s.correct).toBe(s.expected);
    }, 30_000);
  }

  it("the real Form 101, labelled parts", () => {
    const pages = form101 as unknown as GuessPage[];
    const inRegion = (d: { page: number; box: { y: number; height: number } }) =>
      FORM101_REGIONS.some((r) => r.page === d.page && d.box.y + d.box.height / 2 >= r.y1 && d.box.y + d.box.height / 2 <= r.y2);
    const s = scoreDetection(detectFields(pages).filter(inRegion), FORM101_EXPECTED, FORM101_NOT_FIELDS);
    expect(s.problems.map(describeProblem)).toEqual([]);
  });
});
