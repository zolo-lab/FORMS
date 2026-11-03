import { describe, expect, it } from "vitest";
import onboarding from "./fixtures/onboarding-pages.json";
import { detectFields } from "@/lib/pdf/detect";
import type { GuessPage } from "@/lib/pdf/guess";

// A real employee-onboarding package as uploaded to the system (2.11.2026): Form 101 (pages 1–2), the employee
// notice of working conditions (3), the pension fund choice (4) and an institution permit whose words are drawn as
// shapes (5). Read the way the PDF tab reads it (scripts/dump-page-data.ts).
const fields = detectFields(onboarding as unknown as GuessPage[]);
const on = (page: number) => fields.filter((f) => f.page === page);
const named = (page: number, label: string) => on(page).find((f) => f.label === label);
const labelsOf = (page: number) => (onboarding as unknown as GuessPage[])[page]!.labels;

describe("employee notice: typed blanks ('1. זהות המעביד: ______ .')", () => {
  it("each field sits on its own blank, left of its name, not on the words", () => {
    for (const name of ["זהות המעביד", "זהות העובד/ת", "ת.ז", "תאריך תחילת העבודה", "תנאים נוספים"]) {
      const f = named(2, name);
      expect(f, name).toBeDefined();
      const label = labelsOf(2).find((l) => l.str.includes(name.replace("ת.ז", "ת.ז.")) && Math.abs(l.y - f!.box.y) < 6)!;
      expect(f!.box.x + f!.box.width, name).toBeLessThanOrEqual(label.x + 2);
    }
  });
  it("types follow the names: who the employer is is text, ת.ז. is an ID, the start date a date", () => {
    expect(named(2, "זהות המעביד")!.type).toBe("short_text");
    expect(named(2, "ת.ז")!.type).toBe("id_number");
    expect(named(2, "תאריך תחילת העבודה")!.type).toBe("date");
  });
  it("names carry no stray dots or numbering", () => {
    expect(on(2).map((f) => f.label).filter((l) => /^[.\-\d]/.test(l))).toEqual([]);
  });
  it("the two signature captions with nothing drawn get a signature each, above them", () => {
    expect(on(2).filter((f) => f.type === "signature").map((f) => f.label).sort()).toEqual(["חתימת המעסיק", "חתימת עובד/ת"]);
  });
});

describe("fund choice: underlined text in a paragraph", () => {
  it("is not a place to write", () => {
    expect(on(3).filter((f) => /פעל בהתאם|בחירת הקופה/.test(f.label))).toEqual([]);
  });
  it("bank details are still found (the holder's name, and the account as one field)", () => {
    expect(on(3).map((f) => f.label)).toEqual(expect.arrayContaining(["שם בעל החשבון", "חשבון בנק"]));
  });
});

describe("institution permit: words drawn as shapes", () => {
  it("every line to write on is an unnamed field", () => {
    expect(on(4)).toHaveLength(11);
    expect(on(4).every((f) => /^שדה \d+$/.test(f.label))).toBe(true);
  });
});
