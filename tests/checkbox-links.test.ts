import { describe, expect, it } from "vitest";
import { parseFormDefinition, type FormDefinition } from "@/lib/forms/schema";
import type { PdfStamp } from "@/lib/forms/pdf-mapping";
import { applyCheckboxLinks, checkboxAbove, checkSources, suggestCheckboxLinks } from "@/lib/forms/checkbox-links";
import { evaluateCondition } from "@/lib/forms/conditions";

const def = (fields: unknown[]): FormDefinition =>
  parseFormDefinition({ schemaVersion: 1, title: "t", pages: [{ id: "p", title: "", fields }] }).data!;

let n = 0;
const stamp = (fieldId: string, kind: PdfStamp["kind"], x: number, y: number, width = 100, height = 12, extra: Partial<PdfStamp> = {}): PdfStamp =>
  ({ id: `s${n++}`, fieldId, kind, page: 0, x, y, width, height, ...extra });

// Form 101, part ח: "[ ] תושב יישוב מזכה   מתאריך ____   שם היישוב ____" on one line, read right to left.
const form = def([
  { id: "resident", type: "consent", label: "אני תושב/ת קבע ביישוב מזכה" },
  { id: "fromDate", type: "date", label: "מתאריך" },
  { id: "town", type: "short_text", label: "שם היישוב" },
  { id: "newImmigrant", type: "consent", label: "עולה חדש/ה" },
  { id: "immigrationDate", type: "date", label: "תאריך עלייה" },
  { id: "phone", type: "phone", label: "טלפון" },
]);
const stamps = [
  stamp("resident", "check", 520, 600, 10, 10),
  stamp("fromDate", "text", 330, 599),
  stamp("town", "text", 200, 599),
  stamp("newImmigrant", "check", 520, 560, 10, 10),
  // Next line, indented under the box's text.
  stamp("immigrationDate", "text", 380, 541),
  // Far away, at the top of the page.
  stamp("phone", "text", 300, 760),
];

describe("checkbox links from the PDF", () => {
  it("links fields on the box's line and the indented line below it", () => {
    const s = suggestCheckboxLinks(form, stamps);
    expect(s.map((x) => [x.fieldId, x.source.fieldId, x.sameLine])).toEqual([
      ["fromDate", "resident", true],
      ["town", "resident", true],
      ["immigrationDate", "newImmigrant", false],
    ]);
  });

  it("applying shows a field only when its box is ticked", () => {
    const next = applyCheckboxLinks(form, suggestCheckboxLinks(form, stamps));
    const fromDate = next.pages[0]!.fields.find((f) => f.id === "fromDate")!;
    expect(fromDate.visibleIf).toEqual({ field: "resident", op: "eq", value: true });
    expect(evaluateCondition(fromDate.visibleIf, { resident: true })).toBe(true);
    expect(evaluateCondition(fromDate.visibleIf, {})).toBe(false);
    expect(next.pages[0]!.fields.find((f) => f.id === "phone")!.visibleIf).toBeUndefined();
  });

  it("does not touch a field that already has a condition", () => {
    const withCond = def([
      { id: "resident", type: "consent", label: "תושב" },
      { id: "fromDate", type: "date", label: "מתאריך", visibleIf: { field: "x", op: "notEmpty" } },
    ]);
    expect(suggestCheckboxLinks(withCond, stamps.slice(0, 2))).toEqual([]);
  });

  it("does not link a box to a box (a line of options)", () => {
    const opts = def([
      { id: "a", type: "consent", label: "א" },
      { id: "b", type: "consent", label: "ב" },
    ]);
    expect(suggestCheckboxLinks(opts, [stamp("a", "check", 520, 600, 10, 10), stamp("b", "check", 400, 600, 10, 10)])).toEqual([]);
  });

  it("a field before the box on its line (to its right) is not the box's", () => {
    const f = def([
      { id: "name", type: "short_text", label: "שם" },
      { id: "married", type: "consent", label: "נשוי" },
    ]);
    expect(suggestCheckboxLinks(f, [stamp("name", "text", 400, 600), stamp("married", "check", 300, 600, 10, 10)])).toEqual([]);
  });

  it("an option of a choice field: 'other ____' after the 'other' box", () => {
    const f = def([
      { id: "income", type: "checkboxes", label: "סוג הכנסה", options: [{ value: "o1", label: "משכורת" }, { value: "o2", label: "אחר" }] },
      { id: "otherIncome", type: "short_text", label: "פירוט" },
    ]);
    const st = [
      stamp("income", "check", 520, 600, 10, 10, { whenValue: "o1" }),
      stamp("income", "check", 420, 600, 10, 10, { whenValue: "o2" }),
      stamp("otherIncome", "text", 250, 599),
    ];
    const [s] = suggestCheckboxLinks(f, st);
    expect(s!.source.label).toBe("סוג הכנסה: אחר");
    expect(s!.source.condition).toEqual({ field: "income", op: "contains", value: "o2" });
    expect(evaluateCondition(s!.source.condition, { income: ["o2"] })).toBe(true);
  });

  it("yes/no boxes use the option value", () => {
    const f = def([{ id: "kibbutz", type: "yes_no", label: "חבר קיבוץ" }]);
    const src = checkSources(f, [stamp("kibbutz", "check", 500, 600, 10, 10, { whenValue: "yes" }), stamp("kibbutz", "check", 450, 600, 10, 10, { whenValue: "no" })]);
    expect(src.map((s) => s.label)).toEqual(["חבר קיבוץ: כן", "חבר קיבוץ: לא"]);
    expect(src[0]!.condition).toEqual({ field: "kibbutz", op: "eq", value: "yes" });
  });

  it("ignores table cells", () => {
    const f = def([
      { id: "resident", type: "consent", label: "תושב" },
      { id: "kids", type: "repeating_table", label: "ילדים", fields: [{ id: "name", type: "short_text", label: "שם" }] },
    ]);
    expect(suggestCheckboxLinks(f, [stamp("resident", "check", 520, 600, 10, 10), stamp("kids[0].name", "text", 300, 599)])).toEqual([]);
  });
});

describe("link to the box above (editor button)", () => {
  it("uses the place on the document", () => {
    expect(checkboxAbove(form, stamps, "town")?.fieldId).toBe("resident");
  });

  it("without a place, takes the nearest earlier consent or yes/no on the step", () => {
    const f = def([
      { id: "agree", type: "consent", label: "מסכים" },
      { id: "kibbutz", type: "yes_no", label: "חבר קיבוץ" },
      { id: "name", type: "short_text", label: "שם" },
    ]);
    const s = checkboxAbove(f, [], "name");
    expect(s?.fieldId).toBe("kibbutz");
    expect(s?.condition).toEqual({ field: "kibbutz", op: "eq", value: "yes" });
    expect(checkboxAbove(f, [], "agree")).toBeNull();
  });
});
