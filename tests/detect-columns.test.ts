import { describe, expect, it } from "vitest";
import form101 from "./fixtures/form101-pages.json";
import { detectFields } from "@/lib/pdf/detect";
import type { Shapes } from "@/lib/pdf/geometry";
import type { GuessPage } from "@/lib/pdf/guess";
import type { PageLabel } from "@/lib/pdf/labels";

// The official Form 101 as stored in the system (2.11.2026), read the way the PDF tab reads it
// (scripts/dump-page-data.ts). Part ב puts three questions side by side in one ruled row.
const pages = form101 as unknown as GuessPage[];
const fields = detectFields(pages);
const byLabel = (l: string) => fields.filter((f) => f.page === 0 && f.label === l);
const opts = (l: string) => byLabel(l).map((f) => (f.options ?? []).map((o) => o.label));

describe("Form 101, part ב: one question per table cell", () => {
  it("מין: זכר / נקבה, from both rows of its cell", () => {
    expect(opts("מין")).toEqual([["זכר", "נקבה"]]);
    expect(byLabel("מין")[0]!.type).toBe("radio");
  });
  it("מצב משפחתי: all five, top row first, right to left", () => {
    expect(opts("מצב משפחתי")).toEqual([["רווק/ה", "נשוי/אה", "גרוש/ה", "אלמן/ה", "פרוד/ה"]]);
  });
  it("תושב ישראל: a yes/no, not a text field over its squares", () => {
    expect(byLabel("תושב ישראל").map((f) => f.type)).toEqual(["yes_no"]);
  });
  it("no question mixes options from two cells", () => {
    const mixed = fields.filter((f) => f.options?.some((o) => o.label === "זכר") && f.options.some((o) => o.label === "כן"));
    expect(mixed).toEqual([]);
  });
});

// Synthetic rows: the same squares with and without the table's walls.
const empty: Shapes = { lines: [], boxes: [], checkboxes: [], combs: [] };
const label = (id: string, str: string, x: number, y: number, width: number): PageLabel => ({ id, page: 0, str, x, y, width, height: 9 });
const sq = (x: number, y: number) => ({ x, y, width: 9, height: 9 });
const labels = [
  label("h1", "מין", 520, 520, 12), label("h2", "סטטוס", 430, 520, 30), label("h3", "תושב", 330, 520, 24),
  label("a", "זכר", 505, 505, 12), label("b", "נקבה", 500, 492, 18),
  label("c", "רווק", 450, 505, 20), label("d", "נשוי", 395, 505, 20), label("e", "אלמן", 450, 492, 20),
  label("f", "כן", 330, 505, 8), label("g", "לא", 330, 492, 8),
];
const squares = [sq(530, 504), sq(530, 491), sq(472, 504), sq(417, 504), sq(472, 491), sq(345, 504), sq(345, 491)];
const walls = [{ x: 490, y1: 485, y2: 530 }, { x: 370, y1: 485, y2: 530 }, { x: 310, y1: 485, y2: 530 }, { x: 560, y1: 485, y2: 530 }];
const page = (vlines: typeof walls): GuessPage => ({ index: 0, width: 595, height: 842, labels, shapes: { ...empty, checkboxes: squares, vlines } as Shapes });

describe("squares in a ruled row", () => {
  it("are cut at every wall and joined down each cell, named by the cell's title", () => {
    const found = detectFields([page(walls)]).filter((f) => f.options);
    expect(found.map((f) => `${f.label}:${f.options!.map((o) => o.label).join("/")}`).sort()).toEqual(["מין:זכר/נקבה", "סטטוס:רווק/נשוי/אלמן", "תושב:כן/לא"].sort());
    expect(found.find((f) => f.label === "תושב")!.type).toBe("yes_no");
  });
  it("without walls nothing changes from before: one row is one question", () => {
    const found = detectFields([page([])]).filter((f) => f.options && f.options.length > 2);
    expect(found.some((f) => f.options!.map((o) => o.label).includes("זכר") && f.options!.map((o) => o.label).includes("כן"))).toBe(true);
  });
});
