import { describe, expect, it } from "vitest";
import fixture from "./fixtures/guess-page.json";
import { extractShapes, type OpCodes } from "@/lib/pdf/geometry";
import { groupLabels, textItems } from "@/lib/pdf/labels";
import { aliasesFor, matchLocal, matchPrompt, normalizeText, sanitizeMatches, scoreFieldLabel, similarity } from "@/lib/pdf/match";
import { guessOne, guessPlacements, planGuess, unplacedSimpleFields, type GuessPage } from "@/lib/pdf/guess";
import { parseFormDefinition } from "@/lib/forms/schema";
import { pdfMappingSchema } from "@/lib/forms/pdf-mapping";

/** pdfjs.OPS of pdfjs-dist 6. */
const OPS: OpCodes = { save: 10, restore: 11, transform: 12, constructPath: 91, stroke: 20, closeStroke: 21, fill: 22, eoFill: 23, fillStroke: 24, eoFillStroke: 25, closeFillStroke: 26, closeEOFillStroke: 27 };

const def = parseFormDefinition({
  schemaVersion: 1,
  title: "t",
  pages: [{
    id: "p1",
    title: "",
    fields: [
      { id: "lname", type: "short_text", label: "שם משפחה" },
      { id: "tz", type: "id_number", label: 'ת"ז' },
      { id: "agree", type: "consent", label: "אני מסכים" },
      { id: "sig", type: "signature", label: "חתימת העובד" },
      { id: "when", type: "date", label: "תאריך" },
      { id: "notes", type: "short_text", label: "הערות מיוחדות" },
    ],
  }],
}).data!;

const shapes = extractShapes(fixture.ops, OPS);
const labels = groupLabels(0, textItems(fixture.items));
const page: GuessPage = { index: 0, width: fixture.width, height: fixture.height, labels, shapes };

describe("geometry from a real pdf.js operator list", () => {
  it("finds the two underlines, the date box, the checkbox and the nine comb cells", () => {
    expect(shapes.lines.map((l) => [l.x1, l.x2, l.y]).sort()).toEqual([[300, 470, 598], [300, 470, 758]]);
    expect(shapes.combs).toHaveLength(1);
    expect(shapes.combs[0]).toMatchObject({ x: 250, y: 716, height: 18, cells: 9 });
    expect(shapes.combs[0]!.width).toBeCloseTo(162, 3);
    expect(shapes.checkboxes).toHaveLength(1);
    expect(shapes.checkboxes[0]).toMatchObject({ x: 520, y: 680, width: 10, height: 10 });
    expect(shapes.boxes).toHaveLength(1);
    expect(shapes.boxes[0]).toMatchObject({ x: 330, y: 634, width: 130, height: 20 });
  });

  const rect = (x: number, y: number, w: number, h: number) => [0, x, y, 1, x, y + h, 1, x + w, y + h, 1, x + w, y, 4];
  const ops = (paint: number, data: number[], transform?: number[]) => ({
    fnArray: [...(transform ? [10, 12] : []), 91, ...(transform ? [11] : [])],
    argsArray: [...(transform ? [null, transform] : []), [paint, [data], null], ...(transform ? [null] : [])],
  });

  it("reads thin filled bars as rules and ignores filled backgrounds and clip paths", () => {
    expect(extractShapes(ops(22, rect(100, 500, 120, 0.8)), OPS).lines).toEqual([{ x1: 100, x2: 220, y: 500.4 }]);
    expect(extractShapes(ops(22, rect(100, 500, 120, 20)), OPS)).toEqual({ lines: [], boxes: [], checkboxes: [], combs: [] });
    expect(extractShapes(ops(29, rect(100, 500, 120, 20)), OPS).boxes).toEqual([]);
  });
  it("applies the current transform (translate and scale)", () => {
    const s = extractShapes(ops(20, rect(0, 0, 50, 10), [2, 0, 0, 2, 100, 200]), OPS);
    expect(s.boxes).toEqual([{ x: 100, y: 200, width: 100, height: 20 }]);
  });
  it("skips rotated content and curved paths", () => {
    expect(extractShapes(ops(20, rect(0, 0, 50, 10), [0, 1, -1, 0, 0, 0]), OPS).boxes).toEqual([]);
    expect(extractShapes(ops(20, [0, 0, 0, 2, 1, 1, 2, 2, 3, 3, 4]), OPS).boxes).toEqual([]);
  });
  it("copes with typed arrays that went through JSON", () => {
    const s = extractShapes({ fnArray: [91], argsArray: [[20, [{ 0: 0, 1: 300, 2: 700, 3: 1, 4: 480, 5: 700 }], null]] }, OPS);
    expect(s.lines).toEqual([{ x1: 300, x2: 480, y: 700 }]);
  });
});

describe("labels", () => {
  it("merges the words of a Hebrew line right to left and keeps distant text apart", () => {
    const l = groupLabels(0, [
      { str: "משפחה", x: 420, y: 700, width: 40, height: 11 },
      { str: "שם", x: 465, y: 700, width: 18, height: 11 },
      { str: "דוגמה", x: 100, y: 700, width: 35, height: 11 },
    ]);
    expect(l.map((x) => x.str).sort()).toEqual(["דוגמה", "שם משפחה"]);
  });
  it("finds the five printed labels of the sample page", () => {
    expect(labels.map((l) => l.str).sort()).toEqual(["חתימה", "מסכים", "שם משפחה", "תאריך", "תעודת זהות"].sort());
  });
});

describe("matching", () => {
  it("normalises niqqud, quotes, dots and final letters", () => {
    expect(normalizeText('ת.ז.')).toBe("תז");
    expect(normalizeText('דוא"ל')).toBe("דואל");
    expect(normalizeText("שָׁלוֹם  עוֹלָם")).toBe(normalizeText("שלום עולם"));
    expect(normalizeText("מספר")).toBe(normalizeText("מספר"));
  });
  it("scores equal, contained and unrelated text", () => {
    expect(similarity("שם משפחה", "שם משפחה")).toBe(1);
    expect(similarity("שם", "שם משפחה")).toBeGreaterThan(0.85);
    expect(similarity("טלפון", "כתובת")).toBeLessThan(0.4);
  });
  it("uses aliases of the field type and recognises reversed (visual order) text", () => {
    expect(aliasesFor({ id: "tz", type: "id_number", label: 'ת"ז' }).map((a) => a.text)).toContain("תעודת זהות");
    expect(scoreFieldLabel({ id: "tz", type: "id_number", label: 'ת"ז' }, "תעודת זהות")).toBeGreaterThan(0.8);
    const visual = [..."שם משפחה"].reverse().join("");
    expect(scoreFieldLabel({ id: "lname", type: "short_text", label: "שם משפחה" }, visual)).toBe(1);
  });
  it("matches one label to at most one field and leaves unknown fields out", () => {
    const m = matchLocal(def.pages[0]!.fields, labels.map((l) => ({ id: l.id, text: l.str })));
    expect(m.map((x) => x.fieldId).sort()).toEqual(["agree", "lname", "sig", "tz", "when"].sort());
    expect(new Set(m.map((x) => x.labelId)).size).toBe(m.length);
  });
  it("builds a prompt with ids only and sanitises the answer", () => {
    const p = matchPrompt([{ id: "a", type: "date", label: "תאריך" }], [{ id: "p0_l1", text: "תאריך" }]);
    expect(p).toContain("- a | date | תאריך");
    expect(p).toContain("- p0_l1 | תאריך");
    const clean = sanitizeMatches(
      { matches: [
        { fieldId: "a", labelId: "l1", confidence: 0.9 },
        { fieldId: "a", labelId: "l2", confidence: 0.9 }, // field used twice
        { fieldId: "zzz", labelId: "l2", confidence: 0.9 }, // unknown field
        { fieldId: "b", labelId: "l2", confidence: 0.2 }, // not sure enough
        { fieldId: "b", labelId: "l2", confidence: 0.8 },
      ] },
      [{ id: "a" }, { id: "b" }],
      [{ id: "l1" }, { id: "l2" }],
    );
    expect(clean.map((m) => `${m.fieldId}:${m.labelId}`)).toEqual(["a:l1", "b:l2"]);
    expect(sanitizeMatches(null, [], [])).toEqual([]);
    expect(sanitizeMatches({ matches: "x" }, [], [])).toEqual([]);
  });
});

describe("guessPlacements", () => {
  const matches = matchLocal(def.pages[0]!.fields, labels.map((l) => ({ id: l.id, text: l.str })));
  let n = 0;
  const stamps = guessPlacements(def, [page], matches, () => `g${++n}`);
  const of = (id: string) => stamps.find((s) => s.fieldId === id)!;

  it("places five of the six fields; the one without a printed label stays unplaced", () => {
    expect(stamps.map((s) => s.fieldId).sort()).toEqual(["agree", "lname", "sig", "tz", "when"].sort());
    expect(stamps.every((s) => s.guessed === true)).toBe(true);
    expect(pdfMappingSchema.safeParse({ schemaVersion: 1, pages: [{ width: 595, height: 842 }], stamps }).success).toBe(true);
  });
  it("uses the underline for the surname, just above the rule and to the left of the label", () => {
    expect(of("lname")).toMatchObject({ kind: "text", x: 300, width: 170 });
    expect(of("lname").y).toBeCloseTo(759.5, 1);
  });
  it("uses the nine comb cells for the ID number", () => {
    expect(of("tz")).toMatchObject({ kind: "comb", x: 250, y: 716, height: 18, comb: { cells: 9 } });
  });
  it("uses the checkbox for the consent and the box for the date", () => {
    expect(of("agree")).toMatchObject({ kind: "check", x: 520, y: 680, width: 10, height: 10 });
    expect(of("when")).toMatchObject({ kind: "text", x: 331, y: 635, width: 128, height: 18 });
  });
  it("places the signature above its rule, shortened to stay clear of the date box", () => {
    // The date box starts at y 635, so the signature (40pt by default) is shortened to the free 35pt under it.
    expect(of("sig")).toMatchObject({ kind: "signature", x: 300, height: 35 });
    expect(of("sig").y).toBeCloseTo(599.5, 1);
  });
  it("falls back to a default box beside the label when the page has no shape there", () => {
    const bare: GuessPage = { ...page, shapes: { lines: [], boxes: [], checkboxes: [], combs: [] } };
    const g = guessPlacements(def, [bare], matches.filter((m) => m.fieldId === "lname"), () => "x");
    expect(g).toHaveLength(1);
    expect(g[0]!.x + g[0]!.width).toBeLessThan(480);
    // A checkbox or an ID comb is not invented.
    expect(guessPlacements(def, [bare], matches.filter((m) => m.fieldId === "agree" || m.fieldId === "tz").filter((m) => m.fieldId === "agree"), () => "x")).toEqual([]);
  });
  it("never places two guesses on top of each other", () => {
    const twin = guessPlacements(def, [{ ...page, shapes: { ...shapes, boxes: [], lines: [shapes.lines[0]!] } }], [
      { fieldId: "lname", labelId: labels.find((l) => l.str === "שם משפחה")!.id, score: 1 },
      { fieldId: "notes", labelId: labels.find((l) => l.str === "שם משפחה")!.id, score: 1 },
    ], () => "x");
    const [a, b] = twin;
    expect(a).toBeDefined();
    if (b) expect(b.x + b.width <= a!.x || a!.x + a!.width <= b.x || b.y + b.height <= a!.y || a!.y + a!.height <= b.y).toBe(true);
  });
});

describe("planGuess", () => {
  const existing = [{ id: "e", fieldId: "when", kind: "text" as const, page: 0, x: 1, y: 1, width: 10, height: 10 }];
  it("only looks at fields that are not placed yet", () => {
    expect(unplacedSimpleFields(def, existing).map((f) => f.id)).toEqual(["lname", "tz", "agree", "sig", "notes"]);
    expect(unplacedSimpleFields(def, []).map((f) => f.id)).toHaveLength(6);
  });
  it("matches locally when there is no model answer", () => {
    let n = 0;
    const r = planGuess(def, existing, [page], () => `g${++n}`, null);
    expect(r.total).toBe(5);
    expect(r.stamps.map((s) => s.fieldId).sort()).toEqual(["agree", "lname", "sig", "tz"]);
  });
  it("trusts the model's pairs first and lets the local matcher do the rest", () => {
    const dateLabel = labels.find((l) => l.str === "תאריך")!;
    const sigLabel = labels.find((l) => l.str === "חתימה")!;
    // The model says the notes field is the date label; local matching must not reuse that label or field.
    const r = planGuess(def, [], [page], () => "x", [
      { fieldId: "notes", labelId: dateLabel.id, score: 0.9 },
      { fieldId: "ghost", labelId: sigLabel.id, score: 0.9 }, // unknown field: ignored
    ]);
    expect(r.matches.find((m) => m.labelId === dateLabel.id)!.fieldId).toBe("notes");
    expect(r.matches.some((m) => m.fieldId === "when")).toBe(false);
    expect(r.matches.find((m) => m.labelId === sigLabel.id)!.fieldId).toBe("sig");
  });
});

describe("guessOne", () => {
  it("suggests a spot for a single field from its printed label", () => {
    const s = guessOne(def, "lname", [], [page], () => "one");
    expect(s).toMatchObject({ id: "one", fieldId: "lname", kind: "text", x: 300, guessed: true });
  });
  it("returns nothing for a field without a label, an unknown field, or a spot that is already used", () => {
    expect(guessOne(def, "notes", [], [page], () => "x")).toBeNull();
    expect(guessOne(def, "nope", [], [page], () => "x")).toBeNull();
    const used = [{ id: "u", fieldId: "other", kind: "text" as const, page: 0, x: 300, y: 755, width: 170, height: 16 }];
    expect(guessOne(def, "lname", used, [page], () => "x")).toBeNull();
  });
});
