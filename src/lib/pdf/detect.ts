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
  const words = t.split(" ");
  if (words.length >= 2 && words.every((w) => w.length === 1)) return ""; // a letter-spaced heading
  // A sentence ending at the place to write: its last words name the field (the end sits closest to a Hebrew line).
  return !keepLong && words.length > 7 ? words.slice(-6).join(" ") : t;
}

/** Section headings ("ב. פרטי העובד…") and running prose are not the name of a field. */
const isHeading = (l: { str: string; height: number }) => /^\s*[א-ת]\s*[.)]\s/.test(l.str) && (l.str.length > 22 || (l.str.length > 12 && l.height >= 11.5));
const isProse = (str: string) => str.trim().split(/\s+/).length > 12 || /סמן/.test(str);

const has = (n: string, words: string[]) => words.some((w) => n.includes(normalizeText(w)));

/** The type for text typed in a box/line, from its label. */
export function typeFromLabel(label: string): FieldType {
  const n = normalizeText(label);
  if (has(n, ["תעודת זהות", "מספר זהות", "מס זהות", "תז"])) return "id_number";
  if (has(n, ["חתימה", "חתימת", "חתום"])) return "signature";
  if (has(n, ["תאריך", "מתאריך", "עד תאריך"])) return "date";
  if (has(n, ["מייל", "דואל", "אימייל", "אלקטרוני", "email"])) return "email";
  if (has(n, ["טלפון", "נייד", "סלולרי", "פקס"])) return "phone";
  if (has(n, ["סכום", "שכר"]) || n.split(" ").includes("שח") || label.includes("₪")) return "currency";
  if (has(n, ["דרכון"])) return "short_text";
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
function clipAbove(box: Rect, labels: PageLabel[], own: PageLabel | undefined, minHeight: number): Rect | null {
  let top = box.y + box.height;
  for (const l of labels) {
    if (l === own || l.id === own?.id) continue;
    if (l.x >= box.x + box.width - 1 || l.x + l.width <= box.x + 1) continue;
    const bottom = l.y + l.height * 0.2;
    if (bottom > box.y + 1 && bottom < top) top = bottom;
  }
  const height = top - box.y - 0.5;
  if (height >= box.height) return box;
  return height >= minHeight ? { ...box, height } : null;
}

interface Area { kind: "line" | "box" | "comb"; box: Rect; cells?: number; edge: Rect }
interface Pair { area: Area; label: PageLabel; cost: number }

/** A box with two or more labels inside is a table or a frame around a section, not a place to write. */
const labelsInside = (b: Rect, labels: PageLabel[]) =>
  labels.filter((l) => l.x + l.width / 2 >= b.x && l.x + l.width / 2 <= b.x + b.width && l.y + l.height / 2 >= b.y && l.y + l.height / 2 <= b.y + b.height);

function textAreas(page: GuessPage, skip: Set<HLine>): Area[] {
  const out: Area[] = [];
  const { combs } = page.shapes;
  const lines = page.shapes.lines.filter((l) => !skip.has(l));
  const boxes = page.shapes.boxes.filter((b) => labelsInside(b, page.labels).length < 2);
  for (const c of combs) out.push({ kind: "comb", box: c, cells: c.cells, edge: c });
  for (const b of boxes) out.push({ kind: "box", box: { x: b.x + 1, y: b.y + 1, width: Math.max(2, b.width - 2), height: Math.max(2, b.height - 2) }, edge: b });
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
  if (e.y < label.y - 2 && label.y - e.y <= 28 && overlapsX(e.x, right, label)) return 60 + (label.y - e.y) * 2;
  // The name printed under the line ("חתימת המבקש/ת" under a signature line).
  if (e.y >= label.y && e.y - label.y <= 14 && overlapsX(e.x, right, label)) return 40 + (e.y - label.y);
  return null;
}

interface Box { cb: Rect; label?: PageLabel }

/** The text beside a checkbox: on its left (Hebrew puts the square first), else on its right. */
function optionLabel(cb: Rect, labels: PageLabel[], taken: Set<string>): PageLabel | undefined {
  const cy = cb.y + cb.height / 2;
  let best: { l: PageLabel; gap: number } | undefined;
  for (const side of ["left", "right"] as const) {
    for (const l of labels) {
      if (taken.has(l.id) || Math.abs(l.y + l.height * 0.35 - cy) > 8) continue;
      const gap = side === "left" ? cb.x - (l.x + l.width) : l.x - (cb.x + cb.width);
      if (gap < -3 || gap > 40) continue;
      if (!best || gap < best.gap) best = { l, gap };
    }
    if (best) break;
  }
  return best?.l;
}

/** Rows (same baseline, squares not far apart) and columns (same x, stacked closely) of two or more squares. */
function checkGroups(boxes: Box[]): Box[][] {
  const used = new Set<Box>();
  const groups: Box[][] = [];
  const byRow = [...boxes].sort((a, b) => b.cb.y - a.cb.y || b.cb.x - a.cb.x);
  for (const b of byRow) {
    if (used.has(b)) continue;
    const row = byRow.filter((o) => !used.has(o) && Math.abs(o.cb.y - b.cb.y) <= 3).sort((p, q) => q.cb.x - p.cb.x);
    const chain: Box[] = [];
    for (const o of row) {
      const prev = chain[chain.length - 1];
      if (!prev || prev.cb.x - (o.cb.x + o.cb.width) <= 90) chain.push(o);
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
  return groups;
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
  for (const group of [...checkGroups(labelled.filter(isOption)), ...labelled.filter((b) => !isOption(b)).map((b) => [b])]) {
    const rightmost = group[0]!;
    if (group.length === 1) {
      const statement = cleanLabel(rightmost.label!.str, true);
      if (!statement) continue;
      out.push({ label: statement, type: "consent", page: page.index, box: rightmost.cb });
      continue;
    }
    // The question: text just right of the first square on its row, else just above the group.
    const top = Math.max(...group.map((g) => g.cb.y + g.cb.height));
    const left = Math.min(...group.map((g) => g.cb.x));
    const right = Math.max(...group.map((g) => g.cb.x + g.cb.width));
    let question: PageLabel | undefined;
    let bestGap = Infinity;
    for (const l of page.labels) {
      if (claimed.has(l.id)) continue;
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
  const bs = borders(page);
  const areas = textAreas(page, ruled);
  const labels = page.labels.filter((l) => !claimed.has(l.id) && !isHeading(l) && !isProse(l.str));
  const pairs: Pair[] = [];
  for (const area of areas) for (const label of labels) {
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
    let type = area.kind === "comb" && area.cells === 9 ? "id_number" : typeFromLabel(text);
    let box = area.box;
    if (type === "signature") box = { ...box, width: Math.min(box.width, 200), height: DEFAULT_SIZE.signature.height };
    else if (area.kind === "box" && box.height >= 30 && type === "short_text") type = "long_text";
    else if (area.kind === "line") box = { ...box, width: Math.min(box.width, 260) };
    if (area.kind === "line") {
      // A line sits inside its cell: do not run past the borders around it, nor up into the text above.
      const { lo, hi } = cellSides(bs, box.x + box.width / 2, area.edge.y, area.edge.y + 6);
      const x1 = Math.max(box.x, lo !== null && lo < box.x + box.width ? lo + 1 : box.x);
      const x2 = Math.min(box.x + box.width, hi !== null && hi > x1 ? hi - 1 : box.x + box.width);
      if (x2 - x1 >= 15) box = { ...box, x: x1, width: x2 - x1 };
      const clipped = clipAbove(box, page.labels, label, type === "signature" ? 18 : 9);
      if (!clipped) continue;
      box = clipped;
    }
    out.push({ label: text, type: type as FieldType, page: page.index, box: { x: round1(box.x), y: round1(box.y), width: round1(box.width), height: round1(box.height) }, ...(area.kind === "comb" ? { comb: area.cells } : {}) });
  }

  // 4. Table cells: a short label inside a frame with nothing drawn to write on. The answer goes under it, in the
  //    cell, which ends where the next label to its left begins.
  const frames = page.shapes.boxes.filter((b) => labelsInside(b, page.labels).length >= 2);
  for (const label of labels) {
    if (usedLabels.has(label.id)) continue;
    const text = cleanLabel(label.str);
    if (!text || text.length > 30 || text.split(" ").length > 4) continue;
    const cx = label.x + label.width / 2;
    const frame = frames
      .filter((f) => cx >= f.x && cx <= f.x + f.width && label.y >= f.y && label.y + label.height * 0.5 <= f.y + f.height)
      .sort((a, b) => a.width * a.height - b.width * b.height)[0];
    if (!frame) continue;
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
    const y = Math.max(frame.y + 1, label.y - 20);
    const height = Math.min(DEFAULT_SIZE.text.height, label.y - 2 - y);
    if (height < 10) continue;
    usedLabels.add(label.id);
    out.push({ label: text, type: typeFromLabel(text), page: page.index, box: { x: round1(x), y: round1(y), width: round1(width), height: round1(height) } });
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
    inSpan.forEach((o) => used.add(o.id));
    rules.forEach((r) => usedRules.add(r));
    found.push({
      titles: inSpan,
      rules,
      field: {
        label: "טבלה",
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

export function detectFields(pages: GuessPage[]): DetectedField[] {
  const all = pages.flatMap((p) => {
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
