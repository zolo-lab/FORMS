/**
 * Fields a PDF seems to ask for: every place to write (underline, box, ID comb, checkbox) paired with the label
 * printed next to it, and a field type read from the shape and the words. Pure, on the page data that
 * `guess.ts` already uses (labels from `labels.ts`, shapes from `geometry.ts`). Coordinates come only from the PDF;
 * an area without a label is not a field. Forms are Hebrew: the label sits to the right of its area, or above it.
 */
import type { FieldType } from "@/lib/forms/field-types";
import { DEFAULT_SIZE } from "@/lib/forms/pdf-items";
import type { Rect } from "./geometry";
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
}

const overlapsX = (x1: number, x2: number, l: PageLabel) => x1 < l.x + l.width && x2 > l.x;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Drop numbering, trailing colons, asterisks and underscores: "3. שם פרטי:*" → "שם פרטי". */
export function cleanLabel(s: string): string {
  const t = s
    .replace(/^\s*(?:\d{1,2}|[א-ת])\s*[.)]\s+/, "")
    .replace(/[\s:：*_.\-–]+$/g, "")
    .replace(/^[\s:：*_]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[A-Za-z֐-׿]/.test(t)) return ""; // "(1)", "9", "/": a mark, not a name
  const words = t.split(" ");
  if (words.length >= 3 && words.every((w) => w.length === 1)) return ""; // a letter-spaced heading
  // A sentence ending at the place to write: its last words name the field (the end sits closest to a Hebrew line).
  return words.length > 7 ? words.slice(-6).join(" ") : t;
}

/** Section headings ("ב. פרטי העובד…") and running prose are not the name of a field. */
const isHeading = (str: string) => /^\s*[א-ת]\s*[.)]\s/.test(str) && str.length > 22;
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
  if (has(n, ["סכום", "שכר", "שח"]) || label.includes("₪")) return "currency";
  if (has(n, ["דרכון"])) return "short_text";
  if (has(n, ["כמות", "גיל", "מספר", "מיקוד"])) return "number";
  return "short_text";
}

interface Area { kind: "line" | "box" | "comb"; box: Rect; cells?: number; edge: Rect }
interface Pair { area: Area; label: PageLabel; cost: number }

/** A box with two or more labels inside is a table or a frame around a section, not a place to write. */
const labelsInside = (b: Rect, labels: PageLabel[]) =>
  labels.filter((l) => l.x + l.width / 2 >= b.x && l.x + l.width / 2 <= b.x + b.width && l.y + l.height / 2 >= b.y && l.y + l.height / 2 <= b.y + b.height);

function textAreas(page: GuessPage): Area[] {
  const out: Area[] = [];
  const { lines, combs } = page.shapes;
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
      if (!prev || prev.cb.x - (o.cb.x + o.cb.width) <= 160) chain.push(o);
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
  for (const group of checkGroups(boxes.filter((b) => b.label))) {
    const rightmost = group[0]!;
    if (group.length === 1) {
      out.push({ label: cleanLabel(rightmost.label!.str), type: "consent", page: page.index, box: rightmost.cb });
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
    const text = question ? cleanLabel(question.str) : "בחירה";
    const options = group.map((g) => ({ label: cleanLabel(g.label!.str), box: g.cb }));
    const norm = options.map((o) => normalizeText(o.label)).sort().join("|");
    const yesNo = [normalizeText("כן"), normalizeText("לא")].sort().join("|");
    const type: FieldType = norm === yesNo ? "yes_no" : /סמן את כל|ניתן לסמן/.test(question?.str ?? "") ? "checkboxes" : "radio";
    out.push({ label: text, type, page: page.index, box: union(group.map((g) => g.cb)), options });
  }

  // 2. Places to write: each pairs with its closest unclaimed label, one label per area.
  const areas = textAreas(page);
  const labels = page.labels.filter((l) => !claimed.has(l.id) && !isHeading(l.str) && !isProse(l.str));
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
    out.push({ label: text, type: type as FieldType, page: page.index, box: { x: round1(box.x), y: round1(box.y), width: round1(box.width), height: round1(box.height) }, ...(area.kind === "comb" ? { comb: area.cells } : {}) });
  }

  // 3. Table cells: a short label inside a frame with nothing drawn to write on. The answer goes under it, in the
  //    cell, which ends where the next label to its left begins.
  const frames = page.shapes.boxes.filter((b) => labelsInside(b, page.labels).length >= 2);
  for (const label of labels) {
    if (usedLabels.has(label.id)) continue;
    const text = cleanLabel(label.str);
    if (!text || text.length > 30 || text.split(" ").length > 4) continue;
    const cx = label.x + label.width / 2;
    const frame = frames
      .filter((f) => cx >= f.x && cx <= f.x + f.width && label.y >= f.y && label.y + label.height <= f.y + f.height)
      .sort((a, b) => a.width * a.height - b.width * b.height)[0];
    if (!frame) continue;
    const right = label.x + label.width;
    const leftNeighbour = labels
      .filter((o) => o !== label && Math.abs(o.y - label.y) <= 3 && o.x + o.width <= label.x + 2)
      .reduce((m, o) => Math.max(m, o.x + o.width), frame.x);
    const x = Math.max(frame.x + 2, leftNeighbour + 4);
    const width = Math.min(260, Math.max(50, right - x));
    const y = Math.max(frame.y + 1, label.y - 20);
    const height = Math.min(DEFAULT_SIZE.text.height, label.y - 2 - y);
    if (height < 10) continue;
    usedLabels.add(label.id);
    out.push({ label: text, type: typeFromLabel(text), page: page.index, box: { x: round1(right - width), y: round1(y), width: round1(width), height: round1(height) } });
  }
  return out;
}

/** Reading order of a Hebrew page: top to bottom, then right to left within a row. */
function inReadingOrder<T extends { page: number; box: Rect }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.page - b.page || Math.round((b.box.y + b.box.height) / 6) - Math.round((a.box.y + a.box.height) / 6) || b.box.x - a.box.x);
}

export function detectFields(pages: GuessPage[]): DetectedField[] {
  const all = pages.flatMap((p) => detectPage(p));
  return inReadingOrder(all).map((f, i) => ({ ...f, id: `d${i}` }));
}
