/**
 * Fields that belong to a checkbox: on paper, "מתאריך ____" right after "[ ] תושב יישוב מזכה" is only filled when the
 * box is ticked. From where the fields sit on the PDF we suggest "show only when the box is ticked" (a `visibleIf`),
 * and the admin reviews the list before anything changes.
 *
 * Coordinates are PDF points (origin bottom-left). The document is Hebrew, so a line is read right to left: a field
 * that belongs to a box is on its line, to its left, or on the next line, indented under the box's text.
 */
import { FIELD_TYPE_META } from "./field-types";
import type { PdfStamp } from "./pdf-mapping";
import { allFields, type Condition, type FormDefinition, type FormField } from "./schema";
import { updateField } from "./builder";

type Box = { page: number; x: number; y: number; width: number; height: number };

/** Field types whose places on the document are boxes to tick. */
const CHECK_TYPES = new Set<FormField["type"]>(["consent", "yes_no", "radio", "checkboxes"]);

/** One box to tick, and the condition that holds when it is ticked. */
export interface CheckSource {
  fieldId: string;
  /** What the admin sees: the field's label, plus the option for a choice field ("מצב משפחתי: נשוי"). */
  label: string;
  condition: Condition;
  /** Where the box is on the document (none for the field-order fallback of `checkboxAbove`). */
  box?: Box;
}

export interface LinkSuggestion {
  fieldId: string;
  fieldLabel: string;
  source: CheckSource;
  /** On the box's own line (otherwise on the line below it). */
  sameLine: boolean;
}

/** Furthest a field may sit from its box on the same line (points; about a third of an A4 width). */
const MAX_LINE_GAP = 260;
/** Furthest the next line may be (centre to centre, points). */
const MAX_LINE_DROP = 28;

const centerY = (b: Box) => b.y + b.height / 2;
const isTopLevel = (s: PdfStamp) => !s.fieldId.includes("[");

function optionLabel(field: FormField, value: string): string {
  if (field.type === "yes_no") return value === "no" ? "לא" : "כן";
  return field.options?.find((o) => o.value === value)?.label ?? value;
}

function conditionFor(field: FormField, stamp: PdfStamp): Condition | null {
  if (field.type === "consent") return { field: field.id, op: "eq", value: true };
  if (!stamp.whenValue) return null;
  if (field.type === "checkboxes") return { field: field.id, op: "contains", value: stamp.whenValue };
  return { field: field.id, op: "eq", value: stamp.whenValue };
}

/** Every box to tick on the document, with its condition. */
export function checkSources(def: FormDefinition, stamps: readonly PdfStamp[]): CheckSource[] {
  const byId = new Map(allFields(def).map((f) => [f.id, f]));
  const out: CheckSource[] = [];
  for (const s of stamps) {
    if (s.kind !== "check" || !isTopLevel(s)) continue;
    const field = byId.get(s.fieldId);
    if (!field || !CHECK_TYPES.has(field.type)) continue;
    const condition = conditionFor(field, s);
    if (!condition) continue;
    const label = field.type === "consent" ? field.label : `${field.label}: ${optionLabel(field, s.whenValue!)}`;
    out.push({ fieldId: field.id, label, condition, box: { page: s.page, x: s.x, y: s.y, width: s.width, height: s.height } });
  }
  return out;
}

/** The field's first place on the document (top, then rightmost). */
function firstBox(fieldId: string, stamps: readonly PdfStamp[]): Box | null {
  let best: PdfStamp | null = null;
  for (const s of stamps) {
    if (s.fieldId !== fieldId) continue;
    if (!best || s.page < best.page || (s.page === best.page && (s.y + s.height > best.y + best.height + 0.5 || (Math.abs(s.y + s.height - (best.y + best.height)) <= 0.5 && s.x > best.x)))) best = s;
  }
  return best && { page: best.page, x: best.x, y: best.y, width: best.width, height: best.height };
}

/** The box a field placed at `f` belongs to, if any: the nearest box to its right on its line, else the box just above. */
export function boxFor(f: Box, sources: readonly CheckSource[], selfId?: string): { source: CheckSource; sameLine: boolean } | null {
  const fRight = f.x + f.width;
  let line: { s: CheckSource; gap: number } | null = null;
  let above: { s: CheckSource; drop: number; gap: number } | null = null;
  for (const s of sources) {
    const b = s.box;
    if (!b || s.fieldId === selfId || b.page !== f.page) continue;
    const tol = Math.max(6, 0.6 * Math.max(b.height, f.height));
    const dy = centerY(b) - centerY(f);
    if (Math.abs(dy) <= tol) {
      // Same line: the field must come after the box (to its left).
      const gap = b.x - fRight;
      if (gap >= -2 && gap <= MAX_LINE_GAP && (!line || gap < line.gap)) line = { s, gap };
    } else if (dy > tol && dy <= MAX_LINE_DROP) {
      // Next line: indented under the box's text (not further right than the box itself).
      const bRight = b.x + b.width;
      if (fRight > bRight + 4 || bRight - fRight > MAX_LINE_GAP + 140) continue;
      const gap = bRight - fRight;
      if (!above || dy < above.drop - 0.5 || (Math.abs(dy - above.drop) <= 0.5 && gap < above.gap)) above = { s, drop: dy, gap };
    }
  }
  if (line) return { source: line.s, sameLine: true };
  return above ? { source: above.s, sameLine: false } : null;
}

/**
 * Suggested links for fields that do not have a visibility condition yet. Boxes themselves are never linked (a line
 * of options is a list, not a box and its details), nor table cells or fields that are not on the document.
 */
export function suggestCheckboxLinks(def: FormDefinition, stamps: readonly PdfStamp[]): LinkSuggestion[] {
  const sources = checkSources(def, stamps);
  if (sources.length === 0) return [];
  const out: LinkSuggestion[] = [];
  for (const f of allFields(def)) {
    if (!FIELD_TYPE_META[f.type].hasAnswer || CHECK_TYPES.has(f.type) || f.visibleIf) continue;
    const box = firstBox(f.id, stamps);
    if (!box) continue;
    const hit = boxFor(box, sources, f.id);
    if (hit) out.push({ fieldId: f.id, fieldLabel: f.label, source: hit.source, sameLine: hit.sameLine });
  }
  return out;
}

/** Apply the chosen suggestions: each field is shown only when its box is ticked. */
export function applyCheckboxLinks(def: FormDefinition, chosen: readonly LinkSuggestion[]): FormDefinition {
  return chosen.reduce((d, s) => updateField(d, s.fieldId, { visibleIf: s.source.condition }), def);
}

/**
 * "קשר לתיבה שמעל" in the editor: the box this field belongs to on the document; without a place on the document,
 * the nearest earlier single box (a consent or a yes/no question) on the same step.
 */
export function checkboxAbove(def: FormDefinition, stamps: readonly PdfStamp[], fieldId: string): CheckSource | null {
  const box = firstBox(fieldId, stamps);
  if (box) {
    const hit = boxFor(box, checkSources(def, stamps), fieldId);
    if (hit) return hit.source;
  }
  for (const page of def.pages) {
    const at = page.fields.findIndex((f) => f.id === fieldId);
    if (at < 0) continue;
    for (let i = at - 1; i >= 0; i--) {
      const f = page.fields[i]!;
      if (f.type === "consent") return { fieldId: f.id, label: f.label, condition: { field: f.id, op: "eq", value: true } };
      if (f.type === "yes_no") return { fieldId: f.id, label: `${f.label}: כן`, condition: { field: f.id, op: "eq", value: "yes" } };
    }
    return null;
  }
  return null;
}
