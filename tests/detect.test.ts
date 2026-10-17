import { describe, expect, it } from "vitest";
import fixture from "./fixtures/guess-page.json";
import { extractShapes, type OpCodes, type Shapes } from "@/lib/pdf/geometry";
import { groupLabels, textItems, type PageLabel } from "@/lib/pdf/labels";
import { cleanLabel, detectFields, typeFromLabel } from "@/lib/pdf/detect";
import type { GuessPage } from "@/lib/pdf/guess";

const OPS: OpCodes = { save: 10, restore: 11, transform: 12, constructPath: 91, stroke: 20, closeStroke: 21, fill: 22, eoFill: 23, fillStroke: 24, eoFillStroke: 25, closeFillStroke: 26, closeEOFillStroke: 27 };

const sample: GuessPage = {
  index: 0,
  width: fixture.width,
  height: fixture.height,
  labels: groupLabels(0, textItems(fixture.items)),
  shapes: extractShapes(fixture.ops, OPS),
};

const label = (id: string, str: string, x: number, y: number, width: number): PageLabel => ({ id, page: 0, str, x, y, width, height: 11 });
const empty: Shapes = { lines: [], boxes: [], checkboxes: [], combs: [] };
const page = (labels: PageLabel[], shapes: Partial<Shapes>): GuessPage => ({ index: 0, width: 595, height: 842, labels, shapes: { ...empty, ...shapes } });
const sq = (x: number, y: number) => ({ x, y, width: 10, height: 10 });

describe("labels and types", () => {
  it("cleans numbering, colons and stars", () => {
    expect(cleanLabel("3. שם פרטי:*")).toBe("שם פרטי");
    expect(cleanLabel("א) כתובת __")).toBe("כתובת");
    expect(cleanLabel("  תאריך  לידה : ")).toBe("תאריך לידה");
  });
  it("reads the type from the words", () => {
    expect(typeFromLabel("תאריך לידה")).toBe("date");
    expect(typeFromLabel("חתימת העובד")).toBe("signature");
    expect(typeFromLabel("טלפון נייד")).toBe("phone");
    expect(typeFromLabel('דוא"ל')).toBe("email");
    expect(typeFromLabel("מספר זהות")).toBe("id_number");
    expect(typeFromLabel("סכום בש\"ח")).toBe("currency");
    expect(typeFromLabel("גיל")).toBe("number");
    expect(typeFromLabel("שם משפחה")).toBe("short_text");
  });
});

describe("detectFields on the sample page", () => {
  const found = detectFields([sample]);
  it("finds the five fields in reading order with the right types", () => {
    expect(found.map((f) => [f.label, f.type])).toEqual([
      ["שם משפחה", "short_text"],
      ["תעודת זהות", "id_number"],
      ["מסכים", "consent"],
      ["תאריך", "date"],
      ["חתימה", "signature"],
    ]);
    expect(found.map((f) => f.id)).toEqual(["d0", "d1", "d2", "d3", "d4"]);
  });
  it("keeps the place found in the PDF", () => {
    expect(found[1]).toMatchObject({ comb: 9, box: { x: 250, y: 716, height: 18 } });
    expect(found[0]!.box.x).toBe(300);
    expect(found[4]!.box.height).toBe(40);
  });
});

describe("detectFields on synthetic pages", () => {
  it("turns a row of squares with a question into a radio with its options", () => {
    const p = page(
      [label("q", "מין:", 500, 500, 20), label("a", "זכר", 450, 500, 25), label("b", "נקבה", 385, 500, 30)],
      { checkboxes: [sq(480, 499), sq(420, 499)] },
    );
    const [f] = detectFields([p]);
    expect(f).toMatchObject({ label: "מין", type: "radio" });
    expect(f!.options!.map((o) => o.label)).toEqual(["זכר", "נקבה"]);
  });
  it("recognises yes/no and 'mark all' questions", () => {
    const yn = page([label("q", "האם עבדת בעבר", 500, 500, 70), label("a", "כן", 460, 500, 12), label("b", "לא", 400, 500, 12)], { checkboxes: [sq(480, 499), sq(420, 499)] });
    expect(detectFields([yn])[0]!.type).toBe("yes_no");
    const all = page([label("q", "סמן את כל המתאימים", 500, 500, 90), label("a", "ביטוח", 450, 500, 25), label("b", "פנסיה", 385, 500, 30)], { checkboxes: [sq(480, 499), sq(420, 499)] });
    expect(detectFields([all])[0]!.type).toBe("checkboxes");
  });
  it("makes a tall empty box a long text and drops an area with no label", () => {
    const p = page([label("l", "הערות", 500, 600, 30)], {
      boxes: [{ x: 200, y: 560, width: 280, height: 60 }, { x: 50, y: 100, width: 100, height: 20 }],
      lines: [{ x1: 50, x2: 150, y: 300 }],
    });
    const found = detectFields([p]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ label: "הערות", type: "long_text" });
  });
  it("uses the label above a line when none is beside it", () => {
    const p = page([label("l", "כתובת מגורים", 400, 400, 80)], { lines: [{ x1: 380, x2: 500, y: 385 }] });
    expect(detectFields([p])[0]).toMatchObject({ label: "כתובת מגורים", type: "short_text" });
  });
  it("gives one label to one area and ignores page-wide rules", () => {
    const p = page([label("l", "שם", 500, 400, 20)], { lines: [{ x1: 300, x2: 490, y: 398 }, { x1: 100, x2: 290, y: 398 }, { x1: 20, x2: 570, y: 700 }] });
    expect(detectFields([p])).toHaveLength(1);
  });
  it("numbers fields across pages in reading order", () => {
    const a = page([label("l", "שם", 500, 400, 20)], { lines: [{ x1: 300, x2: 490, y: 398 }] });
    const b = { ...page([label("m", "טלפון", 500, 700, 30)], { lines: [{ x1: 300, x2: 480, y: 698 }] }), index: 1 };
    expect(detectFields([b, a]).map((f) => [f.page, f.label])).toEqual([[0, "שם"], [1, "טלפון"]]);
  });
});
