/**
 * Fields a PDF seems to ask for: every place to write (underline, box, ID comb, checkbox) paired with the label
 * printed next to it, and a field type read from the shape and the words. Pure, on the page data that
 * `guess.ts` already uses (labels from `labels.ts`, shapes from `geometry.ts`). Coordinates come only from the PDF;
 * an area without a label is not a field. Forms are Hebrew: the label sits to the right of its area, or above it.
 */
import type { FieldType } from "@/lib/forms/field-types";
import { DEFAULT_SIZE } from "@/lib/forms/pdf-items";
import type { HLine, Rect } from "./geometry";
import { fieldKey, labelKey, sectionKey } from "@/lib/forms/field-keys";
import type { GuessPage } from "./guess";
import type { PageLabel } from "./labels";
import { normalizeText } from "./match";

export interface DetectedOption { label: string; box: Rect }
export interface DetectedField {
  /** Stable within one detection run: "d0", "d1"… in reading order. */
  id: string;
  label: string;
  type: FieldType;
  page: number;
  /** Where the answer goes (for a choice: the union of its boxes). */
  box: Rect;
  /** Number of cells when the answer is written in boxes (nine = an ID number). */
  comb?: number;
  /** Choices, each with the little square to mark. */
  options?: DetectedOption[];
  /** A readable id for the field ("employee_firstName"), from the label and the section it sits in. */
  key?: string;
  /** The section heading above the field ("ב. פרטי העובד/ת"), when there is one. */
  section?: string;
  /** repeating_table: one column per title (right to left) and the rows ruled under the titles. */
  columns?: DetectedColumn[];
  rows?: { y: number; height: number }[];
  /** Set from earlier corrections (learn.ts): the proposal follows a person's decision; `skip` = they dropped it. */
  learned?: boolean;
  skip?: boolean;
  /** Found from the printed name alone (no line or box on the page): the place is a suggestion to the name's left. */
  labelOnly?: boolean;
}
export interface DetectedColumn { key: string; label: string; type: FieldType; x: number; width: number }

const overlapsX = (x1: number, x2: number, l: PageLabel) => x1 < l.x + l.width && x2 > l.x;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Drop numbering, trailing colons, asterisks and underscores: "3. שם פרטי:*" → "שם פרטי". */
export function cleanLabel(s: string, keepLong = false): string {
  const t = s
    .replace(/^\s*(?:\d{1,2}|[א-ת])\s*[.)]\s+/, "")
    .replace(/[\s:：*_.\-–]+$/g, "")
    .replace(/^[\s:：*_)(\]\[}{]+/g, "")
    .replace(/[\s/]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[A-Za-z֐-׿]/.test(t)) return ""; // "(1)", "9", "/": a mark, not a name
  if (!keepLong) {
    // A remark in brackets is not part of the name: "מספר זהות (9 ספרות)" → "מספר זהות". Hebrew PDFs often store the
    // brackets in visual order, ") 9 ספרות(", so either bracket may open the remark.
    const bare = t.replace(/\s*[()][^()]*[()]\s*/g, " ").replace(/\s+/g, " ").trim();
    if (bare !== t && /[A-Za-z֐-׿]/.test(bare)) return cleanLabel(bare, false);
  }
  const words = t.split(" ");
  if (words.length >= 2 && words.every((w) => w.length === 1)) return ""; // a letter-spaced heading
  // A sentence ending at the place to write: its last words name the field (the end sits closest to a Hebrew line).
  return !keepLong && words.length > 7 ? words.slice(-6).join(" ") : t;
}

/** Section headings ("ב. פרטי העובד…") and running prose are not the name of a field. */
const isHeading = (l: { str: string; height: number }) => /^\s*[א-ת]\s*[.)]\s/.test(l.str) && (l.str.length > 22 || (l.str.length > 12 && l.height >= 11.5));
const isProse = (str: string) => str.trim().split(/\s+/).length > 12 || /סמן/.test(str);

/** Latin text with no Hebrew letters: it reads left to right, so its place to write is on its right. */
const isLtr = (str: string) => /[A-Za-z]/.test(str) && !/[\u0590-\u05FF]/.test(str);
const has = (n: string, words: string[]) => words.some((w) => n.includes(normalizeText(w)));

/** The type for text typed in a box/line, from its label. */
export function typeFromLabel(label: string): FieldType {
  const n = normalizeText(label);
  if (has(n, ["דרכון", "passport"])) return "short_text";
  if (has(n, ["זהות", "תז", "idnumber", "zehut", "teudat"])) return "id_number";
  if (has(n, ["חתימה", "חתימת", "חתום", "signature"])) return "signature";
  if (has(n, ["תאריך", "מתאריך", "עד תאריך", "date"])) return "date";
  if (has(n, ["מייל", "דואל", "אימייל", "אלקטרוני", "email"])) return "email";
  if (has(n, ["טלפון", "נייד", "סלולרי", "פקס", "phone", "mobile", "tel"])) return "phone";
  if (has(n, ["סכום", "שכר"]) || n.split(" ").includes("שח") || label.includes("₪")) return "currency";
  if (has(n, ["כמות", "גיל", "מספר", "מיקוד"])) return "number";
  return "short_text";
}

/** Cell borders on the page: ruled verticals plus the sides of drawn boxes and comb cells. */
function borders(page: GuessPage): { x: number; y1: number; y2: number }[] {
  const out = [...(page.shapes.vlines ?? [])];
  for (const b of [...page.shapes.boxes, ...page.shapes.combs]) {
    if (b.height < 8) continue;
    out.push({ x: b.x, y1: b.y, y2: b.y + b.height }, { x: b.x + b.width, y1: b.y, y2: b.y + b.height });
  }
  return out;
}

/** The nearest borders left and right of `cx` that cross the band [yLo, yHi]; null where there is none. */
function cellSides(bs: { x: number; y1: number; y2: number }[], cx: number, yLo: number, yHi: number): { lo: number | null; hi: number | null } {
  let lo: number | null = null;
  let hi: number | null = null;
  for (const b of bs) {
    if (b.y1 > yHi || b.y2 < yLo) continue;
    if (b.x <= cx && (lo === null || b.x > lo)) lo = b.x;
    if (b.x >= cx && (hi === null || b.x < hi)) hi = b.x;
  }
  return { lo, hi };
}

/** Lower the top of `box` so it stays under any text that sits inside its vertical span (except `own`). */
function clipAbove(box: Rect, labels: PageLabel[], own: PageLabel | undefined, minHeight: number): Rect {
  let top = box.y + box.height;
  for (const l of labels) {
    if (l === own || l.id === own?.id) continue;
    if (l.x >= box.x + box.width - 1 || l.x + l.width <= box.x + 1) continue;
    const bottom = l.y + l.height * 0.2;
    if (bottom > box.y + 1 && bottom < top) top = bottom;
  }
  if (top >= box.y + box.height) return box;
  // Never lose the field: when text crowds the line, keep the smallest usable box.
  return { ...box, height: Math.max(minHeight, top - box.y - 0.5) };
}

interface Area { kind: "line" | "box" | "comb"; box: Rect; cells?: number; edge: Rect }
interface Pair { area: Area; label: PageLabel; cost: number }

/** A box with two or more labels inside is a table or a frame around a section, not a place to write. */
const labelsInside = (b: Rect, labels: PageLabel[]) =>
  labels.filter((l) => l.x + l.width / 2 >= b.x && l.x + l.width / 2 <= b.x + b.width && l.y + l.height / 2 >= b.y && l.y + l.height / 2 <= b.y + b.height);

/**
 * A rectangle cut by full-height dividers into equal cells is a row of digit cells (drawn as one frame plus
 * dividers rather than as touching boxes): the number of cells, or null when it is not one.
 */
function evenCells(b: Rect, vlines: Border[]): number | null {
  if (b.height < 8 || b.height > 30) return null;
  const xs = vlines
    .filter((v) => v.x > b.x + 2 && v.x < b.x + b.width - 2 && v.y1 <= b.y + 2 && v.y2 >= b.y + b.height - 2)
    .map((v) => v.x)
    .sort((a, c) => a - c);
  if (!xs.length) return null;
  const edges = [b.x, ...xs, b.x + b.width];
  const step = b.width / (edges.length - 1);
  if (step > b.height * 1.5) return null;
  return edges.every((x, i) => Math.abs(x - (b.x + i * step)) <= 1.5) ? edges.length - 1 : null;
}

function textAreas(page: GuessPage, skip: Set<HLine>): Area[] {
  const out: Area[] = [];
  const { combs } = page.shapes;
  const lines = page.shapes.lines.filter((l) => !skip.has(l));
  const boxes = page.shapes.boxes.filter((b) => labelsInside(b, page.labels).length < 2);
  for (const c of combs) out.push({ kind: "comb", box: c, cells: c.cells, edge: c });
  for (const b of boxes) {
    const cells = evenCells(b, page.shapes.vlines ?? []);
    if (cells) out.push({ kind: "comb", box: b, cells, edge: b });
    else out.push({ kind: "box", box: { x: b.x + 1, y: b.y + 1, width: Math.max(2, b.width - 2), height: Math.max(2, b.height - 2) }, edge: b });
  }
  for (const l of lines) {
    const width = l.x2 - l.x1;
    if (width > page.width * 0.8) continue; // a page rule, not a place to write
    out.push({ kind: "line", box: { x: l.x1, y: l.y + 1.5, width, height: DEFAULT_SIZE.text.height }, edge: { x: l.x1, y: l.y, width, height: 0 } });
  }
  return out;
}

/** How well `label` names `area`: lower is closer; null = not its label. */
function costOf(area: Area, label: PageLabel): number | null {
  const e = area.edge;
  const cy = label.y + label.height * 0.35;
  const right = e.x + e.width;
  if (area.kind === "comb") {
    if (Math.abs(e.y + e.height / 2 - cy) > e.height / 2 + 8 || right > label.x + 3) return null;
    return label.x - right;
  }
  if (area.kind === "box") {
    if (Math.abs(e.y + e.height / 2 - cy) <= e.height / 2 + 6 && right <= label.x + 3) return label.x - right;
    if (e.y + e.height <= label.y + label.height * 0.5 && label.y - (e.y + e.height) <= 14 && overlapsX(e.x, right, label)) return 50 + (label.y - (e.y + e.height)) * 2;
    return null;
  }
  // line
  if (Math.abs(e.y - label.y) <= Math.max(8, label.height) && right <= label.x + 3) return label.x - right + Math.abs(e.y - label.y) * 2;
  // Text written left to right (English) reads label first, then the line on its right.
  if (isLtr(label.str) && Math.abs(e.y - label.y) <= Math.max(8, label.height) && e.x >= label.x + label.width - 3) return e.x - (label.x + label.width) + Math.abs(e.y - label.y) * 2;
  if (e.y < label.y - 2 && label.y - e.y <= 28 && overlapsX(e.x, right, label)) return 60 + (label.y - e.y) * 2;
  // The name printed under the line ("חתימת המבקש/ת" under a signature line).
  if (e.y >= label.y && e.y - label.y <= 14 && overlapsX(e.x, right, label)) return 40 + (e.y - label.y);
  return null;
}

interface Box { cb: Rect; label?: PageLabel }

/** The text beside a checkbox: on its left (Hebrew puts the square first), else on its right. */
function optionLabel(cb: Rect, labels: PageLabel[], taken: Set<string>): PageLabel | undefined {
  const cy = cb.y + cb.height / 2;
  // The nearest text on either side; Hebrew puts the square first (text on its left), so the left wins near-ties.
  let best: { l: PageLabel; gap: number } | undefined;
  for (const side of ["left", "right"] as const) {
    for (const l of labels) {
      if (taken.has(l.id) || Math.abs(l.y + l.height * 0.35 - cy) > 8) continue;
      const raw = side === "left" ? cb.x - (l.x + l.width) : l.x - (cb.x + cb.width);
      if (raw < -3 || raw > 40) continue;
      const gap = side === "left" ? raw : raw + 4;
      if (!best || gap < best.gap) best = { l, gap };
    }
  }
  return best?.l;
}

type Border = { x: number; y1: number; y2: number };

/** A table wall (vertical border) runs between two squares of one row: they answer different questions. */
function wallBetween(bs: Border[], right: Rect, left: Rect): boolean {
  const x1 = left.x + left.width;
  const x2 = right.x;
  const yLo = Math.min(left.y, right.y) + 1;
  const yHi = Math.max(left.y + left.height, right.y + right.height) - 1;
  return bs.some((b) => b.x > x1 + 0.5 && b.x < x2 - 0.5 && b.y1 <= yLo && b.y2 >= yHi);
}

/** The table cell a square sits in, by its nearest walls; "" when no wall bounds it on either side. */
function cellKey(bs: Border[], cb: Rect): string {
  const { lo, hi } = cellSides(bs, cb.x + cb.width / 2, cb.y + 1, cb.y + cb.height - 1);
  return lo === null && hi === null ? "" : `${lo === null ? "-" : Math.round(lo)}|${hi === null ? "-" : Math.round(hi)}`;
}

/**
 * Rows (same baseline, squares not far apart) and columns (same x, stacked closely) of two or more squares.
 * In a ruled table a row of squares is cut at every wall, and squares in one cell on consecutive rows are one
 * question (Form 101 part ב: "מין" זכר/נקבה, "מצב משפחתי" in two rows, "תושב ישראל" כן/לא side by side).
 */
function checkGroups(boxes: Box[], bs: Border[] = [], rules: HLine[] = []): Box[][] {
  const used = new Set<Box>();
  const groups: Box[][] = [];
  const byRow = [...boxes].sort((a, b) => b.cb.y - a.cb.y || b.cb.x - a.cb.x);
  for (const b of byRow) {
    if (used.has(b)) continue;
    // The row from this square leftwards: a square cut off by a wall on its right starts a chain of its own.
    const row = byRow.filter((o) => !used.has(o) && Math.abs(o.cb.y - b.cb.y) <= 3 && o.cb.x <= b.cb.x).sort((p, q) => q.cb.x - p.cb.x);
    const chain: Box[] = [];
    for (const o of row) {
      const prev = chain[chain.length - 1];
      if (!prev || (prev.cb.x - (o.cb.x + o.cb.width) <= 90 && !wallBetween(bs, prev.cb, o.cb))) chain.push(o);
      else break;
    }
    if (chain.length >= 2) { chain.forEach((c) => used.add(c)); groups.push(chain); }
  }
  const byCol = [...boxes].filter((b) => !used.has(b)).sort((a, b) => b.cb.y - a.cb.y);
  for (const b of byCol) {
    if (used.has(b)) continue;
    const chain: Box[] = [b];
    for (const o of byCol) {
      const last = chain[chain.length - 1]!;
      if (o === b || used.has(o) || chain.includes(o)) continue;
      if (Math.abs(o.cb.x - b.cb.x) <= 5 && last.cb.y - (o.cb.y + o.cb.height) <= 30 && o.cb.y < last.cb.y) chain.push(o);
    }
    if (chain.length >= 2) { chain.forEach((c) => used.add(c)); groups.push(chain); }
  }
  for (const b of boxes) if (!used.has(b)) groups.push([b]);
  return bs.length ? mergeCells(groups, bs, rules) : groups;
}

/** Groups (single squares included) that sit in the same walled cell, one under the other, are one question. */
function mergeCells(groups: Box[][], bs: Border[], rules: HLine[] = []): Box[][] {
  const keyOf = (g: Box[]) => {
    const keys = new Set(g.map((b) => cellKey(bs, b.cb)));
    const k = keys.size === 1 ? [...keys][0]! : "";
    return k.includes("|") && !k.startsWith("-|") && !k.endsWith("|-") ? k : "";
  };
  const top = (g: Box[]) => Math.max(...g.map((b) => b.cb.y + b.cb.height));
  const bottom = (g: Box[]) => Math.min(...g.map((b) => b.cb.y));
  const out: Box[][] = [];
  const sorted = [...groups].sort((a, b) => top(b) - top(a));
  const taken = new Set<Box[]>();
  for (const g of sorted) {
    if (taken.has(g)) continue;
    taken.add(g);
    const k = keyOf(g);
    let merged = g;
    if (k) {
      for (const o of sorted) {
        if (taken.has(o) || keyOf(o) !== k) continue;
        // The next row down in the same cell, close under the last one, with no rule across the cell between them.
        if (bottom(merged) - top(o) > 20 || top(o) > bottom(merged) + 1) continue;
        const [lo, hi] = k.split("|").map(Number) as [number, number];
        if (rules.some((r) => r.x1 <= lo + 2 && r.x2 >= hi - 2 && r.y < bottom(merged) && r.y > top(o))) continue;
        taken.add(o);
        merged = [...merged, ...o];
      }
    }
    // Reading order inside a question: rows from the top, right to left.
    out.push(merged.length > g.length ? [...merged].sort((a, b) => (Math.abs(a.cb.y - b.cb.y) <= 3 ? b.cb.x - a.cb.x : b.cb.y - a.cb.y)) : g);
  }
  return out;
}

/**
 * Squares with long texts are statements of their own ("☐ אני תושב/ת…"), except when several share one walled cell
 * as alternatives of its question: a short one among them ("☐ לא") or the same opening word ("☐ כן, …" / "☐ כן, …")
 * (Form 101: "חבר קיבוץ/מושב שיתופי"). Those become one question.
 */
function joinLongOptions(groups: Box[][], bs: Border[], isOption: (b: Box) => boolean): Box[][] {
  if (!bs.length) return groups;
  const key = (g: Box[]) => {
    const ks = new Set(g.map((b) => cellKey(bs, b.cb)));
    const k = ks.size === 1 ? [...ks][0]! : "";
    return k.includes("|") && !k.startsWith("-|") && !k.endsWith("|-") ? k : "";
  };
  const top = (g: Box[]) => Math.max(...g.map((b) => b.cb.y + b.cb.height));
  const bottom = (g: Box[]) => Math.min(...g.map((b) => b.cb.y));
  const firstWord = (b: Box) => normalizeText(cleanLabel(b.label!.str, true)).split(/[\s,.]+/)[0] ?? "";
  const byCell = new Map<string, Box[][]>();
  for (const g of groups) {
    const k = key(g);
    if (!k) continue;
    byCell.set(k, [...(byCell.get(k) ?? []), g]);
  }
  const replaced = new Set<Box[]>();
  const added: Box[][] = [];
  for (const list of byCell.values()) {
    if (list.length < 2 || !list.some((g) => g.some((b) => !isOption(b)))) continue;
    const sorted = [...list].sort((a, b) => top(b) - top(a));
    let run: Box[][] = [sorted[0]!];
    const flush = () => {
      const boxes = run.flat();
      const longs = boxes.filter((b) => !isOption(b));
      // Alternatives, not a statement with its own sub-choices: two or more long ones that open the same way
      // ("כן, …" / "כן, …"), with only a yes/no word beside them ("לא").
      const shorts = boxes.filter((b) => isOption(b)).map((b) => normalizeText(cleanLabel(b.label!.str)));
      const yesNoWords = new Set(["כן", "לא", "אין"].map(normalizeText));
      const alternatives = longs.length >= 2 && new Set(longs.map(firstWord)).size === 1 && shorts.every((w) => yesNoWords.has(w));
      if (run.length >= 2 && alternatives) {
        run.forEach((g) => replaced.add(g));
        added.push(boxes.sort((a, b) => (Math.abs(a.cb.y - b.cb.y) <= 3 ? b.cb.x - a.cb.x : b.cb.y - a.cb.y)));
      }
    };
    for (const g of sorted.slice(1)) {
      if (bottom(run.flat()) - top(g) <= 20) run.push(g);
      else { flush(); run = [g]; }
    }
    flush();
  }
  return replaced.size ? [...groups.filter((g) => !replaced.has(g)), ...added] : groups;
}

/**
 * Questions side by side with no walls between them (Form 101 part ב printed without its vertical rules): two rows
 * of squares under one row of titles, where each question starts both its rows at the same x. Those shared starts
 * cut the rows into columns; when there are as many titles above as columns, each column is one question named by
 * its title, right to left. Anything less certain is left as it was.
 */
function splitAlignedColumns(groups: Box[][], bs: Border[], labels: PageLabel[], claimed: Set<string>): { groups: Box[][]; titles: Map<Box[], PageLabel> } {
  const titles = new Map<Box[], PageLabel>();
  // A row is every unwalled one-line group of squares at one height (the row chain may have cut it in pieces).
  const flat = (g: Box[]) => g.every((b) => Math.abs(b.cb.y - g[0]!.cb.y) <= 3) && !groupCell(bs, g);
  const lines: { y: number; parts: Box[][] }[] = [];
  for (const g of groups.filter(flat)) {
    const line = lines.find((l) => Math.abs(l.y - g[0]!.cb.y) <= 3);
    if (line) line.parts.push(g);
    else lines.push({ y: g[0]!.cb.y, parts: [g] });
  }
  lines.sort((a, b) => b.y - a.y);
  const replaced = new Set<Box[]>();
  const added: Box[][] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i]!.parts.some((g) => replaced.has(g)) || lines[i + 1]!.parts.some((g) => replaced.has(g))) continue;
    const r1 = lines[i]!.parts.flat();
    const r2 = lines[i + 1]!.parts.flat();
    if (r1.length < 2 || r2.length < 2) continue;
    const gap = r1[0]!.cb.y - (r2[0]!.cb.y + r2[0]!.cb.height);
    if (gap < 0 || gap > 12) continue;
    const xs1 = [...r1].sort((a, b) => b.cb.x - a.cb.x);
    const xs2 = [...r2].sort((a, b) => b.cb.x - a.cb.x);
    const starts = xs1.filter((b) => xs2.some((o) => Math.abs(o.cb.x - b.cb.x) <= 2)).map((b) => b.cb.x);
    if (starts.length < 2 || Math.abs(starts[0]! - xs1[0]!.cb.x) > 2 || Math.abs(starts[0]! - xs2[0]!.cb.x) > 2) continue;
    // A start must open a column in both rows: nothing of the other row sits between it and the previous start.
    const top = r1[0]!.cb.y + r1[0]!.cb.height;
    const left = Math.min(...xs1.map((b) => b.cb.x), ...xs2.map((b) => b.cb.x));
    const right = Math.max(...xs1.map((b) => b.cb.x + b.cb.width));
    const heads = labels
      .filter((l) => !claimed.has(l.id) && !isHeading(l) && l.y > top - 1 && l.y - top <= 20 && l.x + l.width > left - 30 && l.x < right + 10 && cleanLabel(l.str).split(" ").length <= 3)
      .sort((a, b) => b.x - a.x);
    if (heads.length !== starts.length || heads.some((h) => Math.abs(h.y - heads[0]!.y) > 3)) continue;
    const column = (b: Box) => starts.findIndex((s, k) => b.cb.x <= s + 2 && (k === starts.length - 1 || b.cb.x > starts[k + 1]! + 2));
    const cols = starts.map(() => [] as Box[]);
    for (const b of [...xs1, ...xs2]) {
      const k = column(b);
      if (k < 0) { cols.length = 0; break; }
      cols[k]!.push(b);
    }
    if (!cols.length || cols.some((c) => !c.length)) continue;
    for (const g of [...lines[i]!.parts, ...lines[i + 1]!.parts]) replaced.add(g);
    cols.forEach((c, k) => {
      const g = c.sort((a, b) => (Math.abs(a.cb.y - b.cb.y) <= 3 ? b.cb.x - a.cb.x : b.cb.y - a.cb.y));
      added.push(g);
      titles.set(g, heads[k]!);
    });
  }
  return { groups: replaced.size ? [...groups.filter((g) => !replaced.has(g)), ...added] : groups, titles };
}

/** The walls of a group's cell, when every square of it sits in one walled cell. */
function groupCell(bs: Border[], group: Box[]): { lo: number; hi: number } | null {
  let cell: { lo: number; hi: number } | null = null;
  for (const b of group) {
    const { lo, hi } = cellSides(bs, b.cb.x + b.cb.width / 2, b.cb.y + 1, b.cb.y + b.cb.height - 1);
    if (lo === null || hi === null) return null;
    if (cell && (Math.abs(cell.lo - lo) > 1 || Math.abs(cell.hi - hi) > 1)) return null;
    cell = { lo, hi };
  }
  return cell;
}

const union = (rs: Rect[]): Rect => {
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  return { x, y, width: Math.max(...rs.map((r) => r.x + r.width)) - x, height: Math.max(...rs.map((r) => r.y + r.height)) - y };
};

function detectPage(page: GuessPage): Omit<DetectedField, "id">[] {
  const out: Omit<DetectedField, "id">[] = [];
  const claimed = new Set<string>();

  // 1. Squares first: their text is an option, not the name of a line beside it.
  const boxes: Box[] = page.shapes.checkboxes.map((cb) => ({ cb }));
  for (const b of boxes) {
    const l = optionLabel(b.cb, page.labels, claimed);
    if (l) { b.label = l; claimed.add(l.id); }
  }
  // Short texts are options of one question; a long statement beside a square stands alone.
  const labelled = boxes.filter((b) => b.label);
  const isOption = (b: Box) => cleanLabel(b.label!.str).split(" ").length <= 4;
  const walls = borders(page);
  /** Cells taken by a question of squares: no place to write is looked for inside them. */
  const choiceCells: Rect[] = [];
  const joined = joinLongOptions([...checkGroups(labelled.filter(isOption), walls, page.shapes.lines), ...labelled.filter((b) => !isOption(b)).map((b) => [b])], walls, isOption);
  const { groups: grouped, titles: alignedTitles } = splitAlignedColumns(joined, walls, page.labels, claimed);
  for (const group of grouped) {
    const rightmost = group[0]!;
    if (group.length === 1) {
      const statement = cleanLabel(rightmost.label!.str, true);
      if (!statement) continue;
      out.push({ label: statement, type: "consent", page: page.index, box: rightmost.cb });
      continue;
    }
    // The question: in a walled cell, the title above the squares inside the cell; otherwise text just right of the
    // first square on its row, else just above the group.
    const top = Math.max(...group.map((g) => g.cb.y + g.cb.height));
    const left = Math.min(...group.map((g) => g.cb.x));
    const right = Math.max(...group.map((g) => g.cb.x + g.cb.width));
    let question: PageLabel | undefined;
    let bestGap = Infinity;
    const cell = groupCell(walls, group);
    const preset = alignedTitles.get(group);
    if (preset && !claimed.has(preset.id)) question = preset;
    if (!question && cell) {
      const bottomY = Math.min(...group.map((g) => g.cb.y));
      choiceCells.push({ x: cell.lo, y: bottomY - 3, width: cell.hi - cell.lo, height: top - bottomY + 20 });
      for (const l of page.labels) {
        if (claimed.has(l.id) || l.x + l.width / 2 < cell.lo || l.x + l.width / 2 > cell.hi) continue;
        const gap = l.y - top;
        if (gap >= -2 && gap <= 20 && gap < bestGap) { question = l; bestGap = gap; }
      }
    }
    if (!question) for (const l of page.labels) {
      if (claimed.has(l.id) || isHeading(l)) continue;
      const sameRow = Math.abs(l.y + l.height * 0.35 - (rightmost.cb.y + rightmost.cb.height / 2)) <= 8;
      const gap = sameRow ? l.x - right : top < l.y && l.y - top <= 30 && overlapsX(left - 12, right + 12, l) ? 60 + (l.y - top) : Infinity;
      if (gap >= -3 && gap <= 120 && gap < bestGap) { question = l; bestGap = gap; }
    }
    if (question) claimed.add(question.id);
    const text = (question && cleanLabel(question.str)) || "בחירה";
    const options = group.map((g) => ({ label: cleanLabel(g.label!.str), box: g.cb }));
    const norm = options.map((o) => normalizeText(o.label)).sort().join("|");
    const yesNo = [normalizeText("כן"), normalizeText("לא")].sort().join("|");
    const type: FieldType = norm === yesNo ? "yes_no" : /סמן את כל|ניתן לסמן/.test(question?.str ?? "") ? "checkboxes" : "radio";
    out.push({ label: text, type, page: page.index, box: union(group.map((g) => g.cb)), options });
  }

  // 2. Tables: a row of short column titles over evenly ruled lines → one repeating table, a cell per column per row.
  const ruled = new Set<HLine>();
  for (const t of detectTables(page, claimed)) {
    t.rules.forEach((l) => ruled.add(l));
    t.titles.forEach((l) => claimed.add(l.id));
    out.push(t.field);
  }

  // 3. Places to write: each pairs with its closest unclaimed label, one label per area.
  const bs = walls;
  const inChoiceCell = (b: Rect) => {
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    return choiceCells.some((c) => cx > c.x && cx < c.x + c.width && cy > c.y && cy < c.y + c.height);
  };
  const areas = textAreas(page, ruled).filter((a) => !inChoiceCell(a.box));
  const labels = page.labels.filter((l) => !claimed.has(l.id) && !isHeading(l) && !isProse(l.str));
  // 3a. A name alone in a ruled cell with room beside it (a grid of small titles, Form 101 part ב "רחוב/שכונה |
  // מספר | עיר/ישוב | מיקוד"): the answer goes in that room, inside the cell, never across its lines.
  const cells = cellFields(page, labels, bs, areas);
  for (const c of cells) {
    out.push(c.field);
    claimed.add(c.label.id);
  }
  // A writing line that served those cells is theirs: it is not offered to another name (a caption above the row).
  const cellTaken = (a: Area) => a.kind === "line" && cells.some((c) => Math.abs(c.field.box.y - a.edge.y) <= 1.5 && a.edge.x < c.field.box.x + c.field.box.width && a.edge.x + a.edge.width > c.field.box.x);
  const pairs: Pair[] = [];
  for (const area of areas.filter((a) => !cellTaken(a))) for (const label of labels.filter((l) => !claimed.has(l.id))) {
    const cost = costOf(area, label);
    if (cost !== null) pairs.push({ area, label, cost });
  }
  pairs.sort((a, b) => a.cost - b.cost);
  const usedAreas = new Set<Area>();
  const usedLabels = new Set<string>();
  for (const { area, label } of pairs) {
    if (usedAreas.has(area) || usedLabels.has(label.id)) continue;
    usedAreas.add(area);
    usedLabels.add(label.id);
    const text = cleanLabel(label.str);
    if (!text) continue;
    let type: FieldType = typeFromLabel(text);
    // Printed digit cells: bank details are a number; otherwise nine cells are an ID, and a run too short for a word
    // is a number, unless the name already says what it is.
    if (area.kind === "comb" && (type === "short_text" || type === "number")) {
      if (has(normalizeText(text), ["בנק", "סניף", "חשבון"])) type = "number";
      else if (area.cells === 9) type = "id_number";
      else if ((area.cells ?? 0) <= 4) type = "number";
    }
    let box = area.box;
    if (type === "signature") box = { ...box, width: Math.min(box.width, 200), height: DEFAULT_SIZE.signature.height };
    else if (area.kind === "box" && box.height >= 30 && type === "short_text") type = "long_text";
    else if (area.kind === "line") box = { ...box, width: Math.min(box.width, 260) };
    if (area.kind === "line") {
      // A line sits inside its cell: do not run past the borders around it, nor up into the text above.
      const { lo, hi } = cellSides(bs, area.edge.x + area.edge.width / 2, area.edge.y, area.edge.y + 6);
      const x1 = Math.max(box.x, lo !== null && lo < box.x + box.width ? lo + 1 : box.x);
      const x2 = Math.min(box.x + box.width, hi !== null && hi > x1 ? hi - 1 : box.x + box.width);
      if (x2 - x1 >= 15) box = { ...box, x: x1, width: x2 - x1 };
      box = clipAbove(box, page.labels, label, type === "signature" ? 18 : 10);
    }
    out.push({ label: text, type: type as FieldType, page: page.index, box: { x: round1(box.x), y: round1(box.y), width: round1(box.width), height: round1(box.height) }, ...(area.kind === "comb" ? { comb: area.cells } : {}) });
  }

  // 4. Table cells: a short label inside a frame with nothing drawn to write on. The answer goes under it, in the
  //    cell, which ends where the next label to its left begins.
  const frames = page.shapes.boxes.filter((b) => labelsInside(b, page.labels).length >= 2);
  for (const label of labels) {
    if (usedLabels.has(label.id) || claimed.has(label.id)) continue;
    const text = cleanLabel(label.str);
    if (!text || text.length > 30 || text.split(" ").length > 4) continue;
    const cx = label.x + label.width / 2;
    const frame = frames
      .filter((f) => cx >= f.x && cx <= f.x + f.width && label.y >= f.y && label.y + label.height * 0.5 <= f.y + f.height)
      .sort((a, b) => a.width * a.height - b.width * b.height)[0];
    if (!frame) continue;
    // A title printed over two lines ("מספר תיק" / "ניכויים"): the lines just under it, aligned to its right edge,
    // are the rest of the name, and the room to write starts under the last of them.
    const rest: PageLabel[] = [];
    for (let last = label; ; ) {
      const next = labels.find((o) => !usedLabels.has(o.id) && !claimed.has(o.id) && o !== label && !rest.includes(o)
        && Math.abs(o.x + o.width - (last.x + last.width)) <= 3 && o.y < last.y && last.y - o.y <= last.height * 1.4
        && cleanLabel(o.str).split(" ").length <= 3);
      if (!next) break;
      rest.push(next);
      last = next;
    }
    const base = rest.length ? rest[rest.length - 1]! : label;
    const right = label.x + label.width;
    const leftNeighbour = labels
      .filter((o) => o !== label && Math.abs(o.y - label.y) <= 3 && o.x + o.width <= label.x + 2)
      .reduce((m, o) => Math.max(m, o.x + o.width), frame.x);
    const side = cellSides(bs.filter((b) => b.x >= frame.x - 1 && b.x <= frame.x + frame.width + 1), cx, label.y - 20, label.y + label.height);
    const cellLo = side.lo !== null && side.lo > frame.x + 1 ? side.lo : null;
    const cellHi = side.hi !== null && side.hi < frame.x + frame.width - 1 ? side.hi : null;
    const x = Math.max(frame.x + 2, leftNeighbour + 4, cellLo !== null ? cellLo + 2 : 0);
    const rightEdge = cellHi !== null ? Math.min(right, cellHi - 2) : right;
    const width = Math.min(260, Math.max(cellHi !== null || cellLo !== null ? 30 : 50, rightEdge - x));
    const y = Math.max(frame.y + 1, base.y - 20);
    const height = Math.min(DEFAULT_SIZE.text.height, base.y - 2 - y);
    if (height < 10) continue;
    // Over cells already read from a ruled grid: the name is the caption of that group ("כתובת פרטית"), not a field.
    const below = { x, y, width, height };
    const overCells = cells.some((c) => {
      const b = c.field.box;
      const w = Math.min(below.x + below.width, b.x + b.width) - Math.max(below.x, b.x);
      const h = Math.min(below.y + below.height, b.y + b.height) - Math.max(below.y, b.y);
      return w > 0 && h > 0 && w * h > b.width * b.height * 0.3;
    });
    if (overCells) continue;
    usedLabels.add(label.id);
    rest.forEach((o) => usedLabels.add(o.id));
    out.push({ label: text, type: typeFromLabel(text), page: page.index, box: { x: round1(x), y: round1(y), width: round1(width), height: round1(height) } });
  }

  // 5. A page with only names and nothing drawn to write on ("שם העובד", "אישור מזכירה"…): each short name gets a
  //    place to its left, on its own row, up to the next text or the page margin.
  if (!out.length) out.push(...labelOnlyFields(page, labels.filter((l) => !claimed.has(l.id))));
  return out;
}

/**
 * Names that sit alone in a closed ruled cell (lines above and below, walls on both sides) with room to write next to
 * them in the same cell, and no line or box of their own inside it. The room is the larger free band above or below
 * the name. Without such a cell nothing is proposed here and the usual pairing decides.
 */
function cellFields(page: GuessPage, labels: PageLabel[], bs: Border[], areas: Area[]): { label: PageLabel; field: Omit<DetectedField, "id"> }[] {
  const out: { label: PageLabel; field: Omit<DetectedField, "id"> }[] = [];
  const hl = page.shapes.lines;
  for (const l of labels) {
    const text = cleanLabel(l.str);
    if (!text || text.split(" ").length > 4) continue;
    const band = { lo: l.y + 0.5, hi: l.y + l.height - 0.5 };
    // The walls beside the name, and the cell they bound: from the lines above and below, or else the walls' own ends.
    let left: Border | null = null;
    let right: Border | null = null;
    for (const b of bs) {
      if (b.y1 > band.lo || b.y2 < band.hi) continue;
      if (b.x <= l.x + 0.5 && (!left || b.x > left.x)) left = b;
      if (b.x >= l.x + l.width - 0.5 && (!right || b.x < right.x)) right = b;
    }
    if (!left || !right) continue;
    const lo = left.x;
    const hi = right.x;
    if (hi - lo < l.width + 8 || hi - lo > 320) continue;
    const spans = (r: HLine) => r.x1 <= lo + 2 && r.x2 >= hi - 2;
    const wallTop = Math.min(left.y2, right.y2);
    const wallBottom = Math.max(left.y1, right.y1);
    const lineAbove = hl.filter((r) => spans(r) && r.y >= l.y + l.height * 0.5 && r.y <= wallTop + 1).sort((a, b) => a.y - b.y)[0];
    const lineBelow = hl.filter((r) => spans(r) && r.y <= l.y + 1 && r.y >= wallBottom - 1).sort((a, b) => b.y - a.y)[0];
    const top = lineAbove?.y ?? wallTop;
    const bottom = lineBelow?.y ?? wallBottom;
    if (top - bottom < 6 || top - bottom > 60) continue;
    // The room to write: above a writing line that crosses the cell over the name (the name is its caption), else the
    // larger free band above or below the name.
    const cellTop = wallTop > top + 4 ? wallTop : top;
    const inCell = (x: number, y: number) => x > lo + 0.5 && x < hi - 0.5 && y > bottom + 0.5 && y < cellTop - 0.5;
    if (page.labels.some((o) => o !== l && o.id !== l.id && inCell(o.x + o.width / 2, o.y + o.height / 2))) continue;
    if (areas.some((a) => a.box.width < (hi - lo) * 0.9 && inCell(a.box.x + a.box.width / 2, a.box.y + a.box.height / 2))) continue;
    if (page.shapes.checkboxes.some((c) => inCell(c.x + c.width / 2, c.y + c.height / 2))) continue;
    let box: Rect;
    if (lineAbove && wallTop - lineAbove.y >= 5) {
      box = { x: lo + 1, y: lineAbove.y + 0.5, width: hi - lo - 2, height: Math.min(DEFAULT_SIZE.text.height, wallTop - lineAbove.y - 1) };
    } else {
      const roomAbove = top - (l.y + l.height);
      const roomBelow = l.y - bottom - 1;
      const room = Math.max(roomAbove, roomBelow);
      if (room < 6) continue;
      box = { x: lo + 1, y: roomAbove >= roomBelow ? l.y + l.height + 0.5 : bottom + 0.5, width: hi - lo - 2, height: room - 1 };
    }
    out.push({ label: l, field: { label: text, type: typeFromLabel(text), page: page.index, box: { x: round1(box.x), y: round1(box.y), width: round1(box.width), height: round1(box.height) } } });
  }
  return out;
}

const MARGIN = 28;
const LABEL_ONLY_WIDTH = 220;

/** Fields read from the names alone (step 5 above). `labelOnly` tells the dialog there was no line or box. */
function labelOnlyFields(page: GuessPage, labels: PageLabel[]): Omit<DetectedField, "id">[] {
  const out: Omit<DetectedField, "id">[] = [];
  const mid = (l: PageLabel) => l.y + l.height * 0.35;
  const heights = page.labels.map((l) => l.height).sort((a, b) => a - b);
  const usual = heights[Math.floor(heights.length / 2)] ?? 10;
  for (const label of labels) {
    // A heading printed larger than the names around it is not a field, numbered or not.
    if (label.height > usual * 1.12 && !/:\s*$/.test(label.str)) continue;
    const text = cleanLabel(label.str);
    if (!text || text.length > 30 || text.split(" ").length > 4) continue;
    // The row ends at the nearest text to its left (another name or a value already printed).
    const leftEdge = page.labels
      .filter((o) => o !== label && Math.abs(mid(o) - mid(label)) <= label.height * 0.6 && o.x + o.width <= label.x + 2)
      .reduce((m, o) => Math.max(m, o.x + o.width + 6), MARGIN);
    const right = label.x - 6;
    const width = Math.min(LABEL_ONLY_WIDTH, right - leftEdge);
    if (width < 60) continue;
    const type: FieldType = /^אישור/.test(text) ? "signature" : typeFromLabel(text);
    // As tall as a written answer, and never into the rows above or below.
    const others = page.labels.filter((o) => o !== label && overlapsX(right - width, right, o) && Math.abs(mid(o) - mid(label)) > label.height * 0.6);
    const room = others.reduce((m, o) => Math.min(m, Math.abs(mid(o) - mid(label)) * 2 - o.height - 2), Infinity);
    const wanted = type === "signature" ? DEFAULT_SIZE.signature.height * 0.75 : Math.max(DEFAULT_SIZE.text.height, label.height * 1.4);
    const height = Math.max(label.height + 2, Math.min(wanted, room));
    const box = { x: right - width, y: mid(label) - height / 2, width, height };
    out.push({ label: text, type, page: page.index, box: { x: round1(box.x), y: round1(box.y), width: round1(box.width), height: round1(box.height) }, labelOnly: true });
  }
  return out;
}

interface FoundTable { field: Omit<DetectedField, "id">; titles: PageLabel[]; rules: HLine[] }

function detectTables(page: GuessPage, claimed: Set<string>): FoundTable[] {
  const found: FoundTable[] = [];
  const free = page.labels.filter((l) => !claimed.has(l.id) && !isHeading(l) && !isProse(l.str));
  const used = new Set<string>();
  const usedRules = new Set<HLine>();
  for (const l of [...free].sort((a, b) => b.y - a.y)) {
    if (used.has(l.id)) continue;
    const row = free.filter((o) => !used.has(o.id) && Math.abs(o.y - l.y) <= 3).sort((a, b) => b.x - a.x);
    const titles = row.filter((o) => { const t = cleanLabel(o.str); return t && t.split(" ").length <= 4; });
    if (titles.length < 2) continue;
    const left = Math.min(...titles.map((o) => o.x));
    const right = Math.max(...titles.map((o) => o.x + o.width));
    const first = page.shapes.lines
      .filter((r) => !usedRules.has(r) && r.y < l.y && r.y >= l.y - 30 && r.x1 <= left + 6 && r.x2 >= right - 6)
      .sort((a, b) => b.y - a.y)[0];
    if (!first) continue;
    const inSpan = row.filter((o) => o.x + o.width / 2 >= first.x1 - 2 && o.x + o.width / 2 <= first.x2 + 2);
    const rules: HLine[] = [first];
    const same = page.shapes.lines
      .filter((r) => r !== first && !usedRules.has(r) && r.y < first.y && Math.abs(r.x1 - first.x1) <= 4 && Math.abs(r.x2 - first.x2) <= 4)
      .sort((a, b) => b.y - a.y);
    for (const r of same) {
      const gap = rules[rules.length - 1]!.y - r.y;
      if (gap < 8) continue; // a double rule
      if (rules.length >= 2) {
        const pitch = rules[0]!.y - rules[1]!.y;
        if (Math.abs(gap - pitch) > Math.max(3, pitch * 0.2)) break;
      } else if (gap > 40) break;
      rules.push(r);
    }
    if (rules.length < 3) continue; // at least two rows
    // Columns: split the width halfway between neighbouring titles (all texts on the row count as neighbours).
    const tb = borders(page).filter((b) => b.x >= first.x1 - 1 && b.x <= first.x2 + 1);
    const centres = inSpan.map((o) => o.x + o.width / 2).sort((a, b) => b - a);
    const keys = new Set<string>();
    const columns: DetectedColumn[] = titles.map((o, i) => {
      const c = o.x + o.width / 2;
      const k = centres.indexOf(c);
      let hi = Math.min(first.x2, k > 0 ? (centres[k - 1]! + c) / 2 : first.x2);
      let lo = Math.max(first.x1, k < centres.length - 1 ? (centres[k + 1]! + c) / 2 : first.x1);
      // Drawn column borders win over the halfway guess.
      const side = cellSides(tb, c, rules[rules.length - 1]!.y, first.y);
      if (side.hi !== null && side.hi > c && side.hi < hi) hi = side.hi;
      if (side.lo !== null && side.lo < c && side.lo > lo) lo = side.lo;
      const label = cleanLabel(o.str);
      let key = labelKey(label) || `col${i + 1}`;
      for (let n = 2; keys.has(key); n++) key = `${labelKey(label) || "col"}${n}`;
      keys.add(key);
      return { key, label, type: typeFromLabel(label), x: round1(lo + 2), width: round1(hi - lo - 4) };
    });
    const rows = rules.slice(0, -1).map((r, k) => {
      const bottom = rules[k + 1]!.y;
      return { y: round1(bottom + 1.5), height: round1(Math.min(DEFAULT_SIZE.text.height, r.y - bottom - 3)) };
    });
    const last = rules[rules.length - 1]!;
    // The table's name: a short text just above its title row ("פרטי ילדים"), else "טבלה".
    const name = free
      .filter((o) => !used.has(o.id) && !inSpan.includes(o) && o.y > l.y + 2 && o.y - l.y <= 32 && overlapsX(first.x1, first.x2, o) && cleanLabel(o.str).split(" ").length <= 6)
      .sort((a, b) => a.y - b.y)[0];
    if (name) inSpan.push(name);
    inSpan.forEach((o) => used.add(o.id));
    rules.forEach((r) => usedRules.add(r));
    found.push({
      titles: inSpan,
      rules,
      field: {
        label: (name && cleanLabel(name.str)) || "טבלה",
        type: "repeating_table",
        page: page.index,
        box: { x: round1(first.x1), y: round1(last.y), width: round1(first.x2 - first.x1), height: round1(l.y + l.height - last.y) },
        columns,
        rows,
      },
    });
  }
  return found;
}

/**
 * Section headings on the page, top to bottom. Two headings printed side by side can arrive as one text
 * ("ג. פרטים על ילדיי … ד. פרטים על הכנסותיי"): each part gets its share of the width (Hebrew: the first part on the right).
 */
function headingsOf(page: GuessPage): PageLabel[] {
  const out: PageLabel[] = [];
  for (const l of page.labels.filter((x) => isHeading(x))) {
    const cuts = [0, ...[...l.str.matchAll(/\s(?=[א-ת]\.\s)/g)].map((m) => m.index! + 1), l.str.length];
    const len = l.str.length || 1;
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i]!;
      const b = cuts[i + 1]!;
      out.push({ ...l, id: `${l.id}_${i}`, str: l.str.slice(a, b).trim(), x: l.x + l.width * (1 - b / len), width: (l.width * (b - a)) / len });
    }
  }
  return out.sort((a, b) => b.y - a.y);
}

/** Text of a heading up to its first bracket: "ג. פרטים על ילדיי (עפ"י ספח)" → "פרטים על ילדיי". */
const headingName = (h: string) => cleanLabel(h.split(/[()]/)[0] ?? h, true);

/** Reading order of a Hebrew page: top to bottom, then right to left within a row. */
function inReadingOrder<T extends { page: number; box: Rect }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.page - b.page || Math.round((b.box.y + b.box.height) / 6) - Math.round((a.box.y + a.box.height) / 6) || b.box.x - a.box.x);
}

/**
 * A run of underscores or dots typed as text ("שם: ________") is a line to write on: it becomes a drawn line under
 * the run and leaves the labels, so the name beside it pairs with it like with any line.
 */
export function typedLines(page: GuessPage): GuessPage {
  const RUN = /[_]{4,}|[.]{6,}|[…]{3,}/g;
  const lines: HLine[] = [];
  const labels: PageLabel[] = [];
  for (const l of page.labels) {
    const matches = [...l.str.matchAll(RUN)];
    if (!matches.length) { labels.push(l); continue; }
    const per = l.width / Math.max(1, l.str.length);
    // Text runs are stored in visual order for Hebrew: positions are measured from the left edge of the label.
    const rtl = /[֐-׿]/.test(l.str);
    for (const m of matches) {
      const start = m.index!;
      const end = start + m[0].length;
      const x1 = rtl ? l.x + l.width - end * per : l.x + start * per;
      lines.push({ x1: round1(x1), x2: round1(x1 + m[0].length * per), y: round1(l.y - 1) } as HLine);
    }
    const rest = l.str.replace(RUN, " ").replace(/\s+/g, " ").trim();
    if (/[A-Za-z֐-׿]/.test(rest)) {
      // The name keeps its own side: the right end in Hebrew, the left end otherwise.
      const width = Math.max(4, l.width - matches.reduce((n, m) => n + m[0].length, 0) * per);
      labels.push({ ...l, str: rest, x: rtl ? l.x + l.width - width : l.x, width });
    }
  }
  if (!lines.length) return page;
  return { ...page, labels, shapes: { ...page.shapes, lines: [...page.shapes.lines, ...lines] } };
}

export function detectFields(pages: GuessPage[]): DetectedField[] {
  const all = pages.map(typedLines).flatMap((p) => {
    const heads = headingsOf(p);
    return detectPage(p).map((f) => {
      // The nearest heading above the field (its top edge, a little tolerance for headings on the same line).
      const top = f.box.y + f.box.height;
      const above = heads.filter((x) => x.y >= top - 2).sort((a, b) => a.y - b.y);
      // Prefer the heading over the same part of the page (two sections side by side).
      const near = above[0];
      const h = (near && above.find((x) => x.y - near.y < 40 && x.x < f.box.x + f.box.width + 20 && x.x + x.width > f.box.x - 20)) || near;
      return h ? { ...f, section: cleanLabel(h.str, true) } : f;
    });
  });
  return inReadingOrder(all).map((f, i) => {
    const prefix = sectionKey(f.section);
    if (f.type === "repeating_table") {
      const label = (f.section && headingName(f.section)) || f.label;
      return { ...f, id: `d${i}`, label, key: prefix || labelKey(label) || "table" };
    }
    return { ...f, id: `d${i}`, key: fieldKey(f.label, f.section, "") || undefined };
  });
}
