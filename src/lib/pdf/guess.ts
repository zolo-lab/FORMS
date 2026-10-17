/**
 * Where on a PDF each form field probably goes. Inputs: the form, the labels and shapes found on each page
 * (`labels.ts`, `geometry.ts`) and which label belongs to which field (`match.ts`). Coordinates come only from the
 * PDF: the entry area is the underline, box or comb nearest the label (to its left, since forms are Hebrew; failing
 * that, just below), and a plain default box next to the label when the page has no such shape.
 * Everything returned is marked `guessed`, so the editor can show it as a suggestion.
 */
import { allFields, type FormDefinition, type FormField } from "@/lib/forms/schema";
import { DEFAULT_SIZE, placeableItems } from "@/lib/forms/pdf-items";
import type { PdfStamp } from "@/lib/forms/pdf-mapping";
import { matchLocal, type Match } from "./match";
import type { PageLabel } from "./labels";
import type { Rect, Shapes } from "./geometry";

export interface GuessPage { index: number; width: number; height: number; labels: PageLabel[]; shapes: Shapes }

interface Cand { box: Rect; cost: number; comb?: number }

const overlapArea = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
const overlapsX = (x1: number, x2: number, l: PageLabel) => x1 < l.x + l.width && x2 > l.x;

export function guessPlacements(def: FormDefinition, pages: GuessPage[], matches: Match[], newId: () => string): PdfStamp[] {
  const items = placeableItems(def);
  const fields = allFields(def);
  const out: PdfStamp[] = [];
  const taken: { page: number; box: Rect }[] = [];

  for (const m of matches) {
    const page = pages.find((p) => p.labels.some((l) => l.id === m.labelId));
    const label = page?.labels.find((l) => l.id === m.labelId);
    const field = fields.find((f) => f.id === m.fieldId);
    if (!page || !label || !field) continue;
    const mine = items.filter((it) => it.fieldId === field.id);
    const item = mine.length === 1 && !mine[0]!.part && !mine[0]!.whenValue ? mine[0]! : undefined;
    if (!item) continue;

    const cy = label.y + label.height * 0.35;
    const size = DEFAULT_SIZE[item.kind];
    const cands: Cand[] = [];
    const { lines, boxes, checkboxes, combs } = page.shapes;

    if (item.kind === "check") {
      for (const cb of checkboxes) {
        if (Math.abs(cb.y + cb.height / 2 - cy) > 8) continue;
        const dx = cb.x >= label.x + label.width ? cb.x - (label.x + label.width) : label.x - (cb.x + cb.width);
        if (dx <= 40) cands.push({ box: cb, cost: Math.max(0, dx) });
      }
    } else {
      if (field.type === "id_number") {
        for (const c of combs) {
          if (Math.abs(c.y + c.height / 2 - cy) > c.height / 2 + 8 || c.x + c.width > label.x + 3) continue;
          cands.push({ box: c, cost: label.x - (c.x + c.width) - 20, comb: c.cells });
        }
      }
      const h = size.height;
      for (const l of lines) {
        const width = Math.min(l.x2 - l.x1, item.kind === "signature" ? 200 : 260);
        if (Math.abs(l.y - label.y) <= Math.max(8, label.height) && l.x2 <= label.x + 3) {
          cands.push({ box: { x: l.x1, y: l.y + 1.5, width, height: h }, cost: label.x - l.x2 + Math.abs(l.y - label.y) * 2 });
        } else if (l.y < label.y - 2 && label.y - l.y <= 28 && overlapsX(l.x1, l.x2, label)) {
          cands.push({ box: { x: l.x1, y: l.y + 1.5, width, height: h }, cost: 60 + (label.y - l.y) * 2 });
        }
      }
      for (const b of boxes) {
        const inset: Rect = { x: b.x + 1, y: b.y + 1, width: Math.max(2, b.width - 2), height: Math.max(2, b.height - 2) };
        if (Math.abs(b.y + b.height / 2 - cy) <= b.height / 2 + 6 && b.x + b.width <= label.x + 3) {
          cands.push({ box: inset, cost: label.x - (b.x + b.width) + 1 });
        } else if (b.y + b.height <= label.y + label.height * 0.5 && label.y - (b.y + b.height) <= 14 && overlapsX(b.x, b.x + b.width, label)) {
          cands.push({ box: inset, cost: 50 + (label.y - (b.y + b.height)) * 2 });
        }
      }
      // Nothing drawn there: a default box left of the label, or under it when the label is near the page edge.
      const left = label.x - 4 - size.width;
      cands.push({ box: left >= 8 ? { x: left, y: label.y - 3, width: size.width, height: size.height } : { x: label.x, y: label.y - size.height - 4, width: size.width, height: size.height }, cost: 400 });
    }

    cands.sort((a, b) => a.cost - b.cost);
    const pick = cands.find((c) => {
      if (c.box.x < 0 || c.box.y < 0 || c.box.x + c.box.width > page.width + 1 || c.box.y + c.box.height > page.height + 1) return false;
      if (taken.some((t) => t.page === page.index && overlapArea(t.box, c.box) > 0.5)) return false;
      // Never cover another label's text.
      return !page.labels.some((o) => o.id !== label.id && overlapArea(c.box, { x: o.x, y: o.y, width: o.width, height: o.height }) > 0.25 * o.width * o.height);
    });
    if (!pick) continue;

    taken.push({ page: page.index, box: pick.box });
    const round = (n: number) => Math.round(n * 10) / 10;
    out.push({
      id: newId(),
      fieldId: field.id,
      kind: pick.comb ? "comb" : item.kind,
      page: page.index,
      x: round(pick.box.x),
      y: round(pick.box.y),
      width: round(pick.box.width),
      height: round(pick.box.height),
      ...(pick.comb ? { comb: { cells: pick.comb } } : {}),
      guessed: true,
    });
  }
  return out;
}

/** Fields that have nothing on the document yet and are a single thing to place (no parts, no options). */
export function unplacedSimpleFields(def: FormDefinition, stamps: PdfStamp[]): FormField[] {
  const items = placeableItems(def);
  const placed = new Set(stamps.map((s) => s.fieldId));
  return allFields(def).filter((f) => {
    if (placed.has(f.id)) return false;
    const mine = items.filter((it) => it.fieldId === f.id);
    return mine.length === 1 && !mine[0]!.part && !mine[0]!.whenValue;
  });
}

/**
 * The whole suggestion: which unplaced fields have a spot and where. `claude` (optional) are pairs a language
 * model chose; the local matcher fills in whatever it left open, or does everything when `claude` is null.
 */
export function planGuess(
  def: FormDefinition,
  existing: PdfStamp[],
  pages: GuessPage[],
  newId: () => string,
  claude?: Match[] | null,
): { total: number; stamps: PdfStamp[]; matches: Match[] } {
  const targets = unplacedSimpleFields(def, existing);
  const labels = pages.flatMap((p) => p.labels).map((l) => ({ id: l.id, text: l.str }));
  const ids = new Set(targets.map((f) => f.id));
  const known = new Set(labels.map((l) => l.id));
  const fromClaude = (claude ?? []).filter((m) => ids.has(m.fieldId) && known.has(m.labelId));
  const usedF = new Set(fromClaude.map((m) => m.fieldId));
  const usedL = new Set(fromClaude.map((m) => m.labelId));
  const local = matchLocal(targets.filter((f) => !usedF.has(f.id)), labels.filter((l) => !usedL.has(l.id)));
  const matches = [...fromClaude, ...local];
  return { total: targets.length, stamps: guessPlacements(def, pages, matches, newId), matches };
}
