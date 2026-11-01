import { describe, expect, it } from "vitest";
import fixture from "./fixtures/guess-page.json";
import { extractShapes, type OpCodes, type Shapes } from "@/lib/pdf/geometry";
import { groupLabels, splitGlyphs, textItems, type PageLabel } from "@/lib/pdf/labels";
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
    // Form 101: a bracketed remark, stored in visual order, is not part of the name.
    expect(cleanLabel("מספר זהות ) 9 ספרות(")).toBe("מספר זהות");
    expect(cleanLabel("מספר דרכון (למי שאין מספר ת.ז.)")).toBe("מספר דרכון");
    expect(typeFromLabel(cleanLabel("מספר זהות ) 9 ספרות("))).toBe("id_number");
    expect(typeFromLabel("מספר דרכון למי שאין מספר ת.ז.")).toBe("short_text");
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

describe("labels that are not names", () => {
  it("drops marks, letter-spaced headings, and keeps the end of a long sentence", () => {
    expect(cleanLabel("(1)")).toBe("");
    expect(cleanLabel("9")).toBe("");
    expect(cleanLabel("ש נ ת ה מ ס")).toBe("");
    expect(cleanLabel("אני מצהיר שהפרטים שמסרתי בטופס זה מלאים ונכונים ואני מבקש תאריך לידה")).toBe("בטופס זה מלאים ונכונים ואני מבקש תאריך לידה".split(" ").slice(-6).join(" "));
  });
  it("does not read a currency out of the middle of a word", () => {
    expect(typeFromLabel("תעודת שחרור")).toBe("short_text");
    expect(typeFromLabel("סכום בש\"ח")).toBe("currency");
  });
  it("reads passports as text and zip codes as numbers", () => {
    expect(typeFromLabel("מספר דרכון")).toBe("short_text");
    expect(typeFromLabel("מיקוד")).toBe("number");
    expect(typeFromLabel("כתובת דואר אלקטרוני")).toBe("email");
  });
});

describe("checkbox glyphs in the text", () => {
  it("cuts a glyph out of its item and puts a square where it is drawn", () => {
    const { items, squares } = splitGlyphs([{ str: "o זכר", x: 500, y: 553, width: 37, height: 11 }]);
    expect(items.map((i) => i.str)).toEqual(["זכר"]);
    expect(squares).toHaveLength(1);
    // Hebrew reads right to left: the square sits at the right end, past the word.
    expect(squares[0]!.x).toBeGreaterThan(items[0]!.x + items[0]!.width - 3);
  });
  it("makes one label per option when a glyph row is a single item", () => {
    const { items, squares } = splitGlyphs([{ str: "o נקבה o אלמן/ה o פרוד/ה", x: 333, y: 540, width: 203, height: 11 }]);
    expect(squares).toHaveLength(3);
    expect(groupLabels(0, items).map((l) => l.str)).toEqual(["נקבה", "אלמן/ה", "פרוד/ה"]);
  });
  it("finds a radio question from glyph squares", () => {
    const { items, squares } = splitGlyphs([
      { str: "o זכר", x: 500, y: 553, width: 37, height: 11 },
      { str: "o אשה", x: 500, y: 540, width: 37, height: 11 },
      { str: "מין", x: 522, y: 567, width: 14, height: 10 },
    ]);
    const found = detectFields([page(groupLabels(0, items), { checkboxes: squares })]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ label: "מין", type: "radio" });
    expect(found[0]!.options!.map((o) => o.label).sort()).toEqual(["אשה", "זכר"]);
  });
});

describe("table cells", () => {
  const frame = { x: 30, y: 640, width: 500, height: 50 };
  const labels = [label("a", "שם פרטי", 450, 670, 40), label("b", "שם משפחה", 330, 670, 45)];
  const found = detectFields([page(labels, { boxes: [frame] })]);
  it("proposes a field under each short label in a frame, and not the frame itself", () => {
    expect(found.map((f) => f.label)).toEqual(["שם פרטי", "שם משפחה"]);
    for (const f of found) {
      expect(f.box.y + f.box.height).toBeLessThan(670);
      expect(f.box.y).toBeGreaterThanOrEqual(frame.y);
    }
  });
  it("ends each answer where the next label begins", () => {
    expect(found[0]!.box.x).toBeGreaterThanOrEqual(375);
    expect(found[0]!.box.x + found[0]!.box.width).toBeCloseTo(490, 0);
  });
  it("skips headings and instructions inside a frame", () => {
    const f = detectFields([page([label("h", "ב. פרטי העובד יש לצרף צילום תעודת זהות", 100, 680, 400), label("i", "סמן את הילדים", 300, 665, 60), label("n", "שם", 480, 670, 20)], { boxes: [{ ...frame, height: 60 }] })]);
    expect(f.map((x) => x.label)).toEqual(["שם"]);
  });
});

describe("statements and signature lines", () => {
  it("makes one consent per long statement even when they stand in a column", () => {
    const labels = [label("a", "אני תושב/ת קבוע/ה בישוב מזכה לפי הרשימה", 300, 700, 200), label("b", "אני הורה במשפחה חד הורית ומקבל קצבה", 300, 670, 200)];
    const found = detectFields([page(labels, { checkboxes: [sq(505, 700), sq(505, 670)] })]);
    expect(found.map((f) => f.type)).toEqual(["consent", "consent"]);
    expect(found[0]!.label).toBe("אני תושב/ת קבוע/ה בישוב מזכה לפי הרשימה");
  });
  it("takes the name printed under a line as its label", () => {
    const line = { x1: 34, x2: 122, y: 186 };
    const found = detectFields([page([label("s", "חתימת המבקש/ת", 49, 179, 60)], { lines: [line] })]);
    expect(found.map((f) => [f.label, f.type])).toEqual([["חתימת המבקש/ת", "signature"]]);
  });
});

describe("borders", () => {
  it("keeps a signature line from growing up into the statement above it", () => {
    const line = { x1: 90, x2: 290, y: 100 };
    const text = label("p", "אני מצהיר כי הפרטים שמסרתי נכונים", 100, 125, 180);
    const found = detectFields([page([text, label("s", "חתימת המבקש/ת", 150, 90, 70)], { lines: [line] })]);
    const sig = found.find((f) => f.type === "signature")!;
    expect(sig.box.y + sig.box.height).toBeLessThanOrEqual(125 + 11 * 0.2);
  });
  it("stops a line at the cell borders around it", () => {
    const line = { x1: 100, x2: 400, y: 100 };
    const found = detectFields([page([label("n", "שם", 420, 102, 15)], { lines: [line], vlines: [{ x: 150, y1: 90, y2: 120 }, { x: 405, y1: 90, y2: 120 }] })]);
    const f = found.find((x) => x.label === "שם")!;
    expect(f.box.x).toBeGreaterThanOrEqual(150);
    expect(f.box.x + f.box.width).toBeLessThanOrEqual(405);
  });
  it("reads vertical rules", () => {
    const v = extractShapes({ fnArray: [91], argsArray: [[OPS.stroke, [[0, 50, 10, 1, 50, 60]]]] } as never, OPS);
    expect(v.vlines).toEqual([{ x: 50, y1: 10, y2: 60 }]);
  });
});

describe("tables", () => {
  // A children table like form 101: three titles over 5 evenly ruled lines (4 rows).
  const titles = [label("t1", "שם", 483, 466, 11), label("t2", "מספר זהות", 379, 466, 37), label("t3", "תאריך לידה", 282, 466, 37)];
  const lines = [462, 440, 418, 396, 374].map((y) => ({ x1: 256, x2: 540, y }));
  const heading = label("h", "ג. פרטים על ילדיי שבשנת המס טרם מלאו להם 19 שנה", 85, 499, 459);
  const found = detectFields([page([heading, ...titles], { lines })]);
  it("finds one repeating table with a column per title and a row per ruled line", () => {
    expect(found).toHaveLength(1);
    const t = found[0]!;
    expect(t.type).toBe("repeating_table");
    expect(t.columns!.map((c) => [c.key, c.type])).toEqual([["name", "short_text"], ["idNumber", "id_number"], ["birthDate", "date"]]);
    expect(t.rows).toHaveLength(4);
    expect(t.key).toBe("children");
  });
  it("splits the width between the titles, right to left", () => {
    const [name, id, birth] = found[0]!.columns!;
    expect(name!.x).toBeGreaterThan(id!.x + id!.width - 1);
    expect(id!.x).toBeGreaterThan(birth!.x + birth!.width - 1);
    expect(birth!.x).toBeGreaterThanOrEqual(256);
    expect(name!.x + name!.width).toBeLessThanOrEqual(540);
  });
  it("does not make a table from a single ruled line", () => {
    const one = detectFields([page(titles, { lines: [lines[0]!] })]);
    expect(one.some((f) => f.type === "repeating_table")).toBe(false);
  });
});

describe("ids from the section", () => {
  it("gives each field a readable key with its section prefix", () => {
    const heading = label("h", "ו. פרטים על בן/בת הזוג ועוד פרטים", 300, 720, 230);
    const f = detectFields([page([heading, label("a", "שם פרטי", 450, 700, 40)], { lines: [{ x1: 300, x2: 445, y: 700 }] })]);
    expect(f[0]).toMatchObject({ label: "שם פרטי", key: "spouse_firstName" });
  });
});
