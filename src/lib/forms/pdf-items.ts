/**
 * Which things can be placed on a PDF for a given form, and how a placed stamp maps back to one.
 * Pure logic for the placement UI.
 */
import { FIELD_TYPE_META } from "./field-types";
import type { PdfStamp } from "./pdf-mapping";
import { resolveOptions } from "./lookups";
import { allFields, type FormDefinition, type FormField } from "./schema";

export interface PlaceableItem {
  key: string;
  fieldId: string;
  part?: string;
  whenValue?: string;
  kind: PdfStamp["kind"];
  label: string;
  /** Group heading in the list (field label). */
  group: string;
  multiline?: boolean;
}

export const stampKey = (s: { fieldId: string; part?: string; whenValue?: string }) => `${s.fieldId}|${s.part ?? ""}|${s.whenValue ?? ""}`;

export const DEFAULT_SIZE: Record<PdfStamp["kind"], { width: number; height: number }> = {
  text: { width: 120, height: 16 },
  check: { width: 12, height: 12 },
  signature: { width: 120, height: 40 },
  image: { width: 80, height: 40 },
  comb: { width: 180, height: 20 },
  date_signed: { width: 90, height: 16 },
  initials: { width: 50, height: 18 },
  stamp_image: { width: 90, height: 90 },
};

const UNSUPPORTED = new Set(["radio_grid", "checkbox_grid", "grid", "file_upload", "hidden"]);

function itemsForField(f: FormField, idPrefix: string, labelPrefix: string): PlaceableItem[] {
  const meta = FIELD_TYPE_META[f.type];
  if (!meta.hasAnswer || UNSUPPORTED.has(f.type)) return [];
  const fieldId = idPrefix + f.id;
  const group = labelPrefix + (f.label || f.id);
  const base = { fieldId, group };
  const make = (over: Partial<PlaceableItem> & { kind: PlaceableItem["kind"]; label: string }): PlaceableItem => {
    const item = { ...base, ...over, key: "" };
    item.key = stampKey(item);
    return item;
  };

  if (f.type === "signature") return [make({ kind: "signature", label: "חתימה" })];
  if (f.type === "consent") return [make({ kind: "check", label: "סימון X כשמאושר" })];
  if (f.type === "yes_no") {
    return [
      make({ kind: "check", whenValue: "yes", label: "X ב\"כן\"" }),
      make({ kind: "check", whenValue: "no", label: "X ב\"לא\"" }),
    ];
  }
  if (f.type === "radio" || f.type === "checkboxes") {
    const checks = resolveOptions(f).map((o) => make({ kind: "check", whenValue: o.value, label: `X ליד "${o.label}"` }));
    return [make({ kind: "text", label: f.type === "radio" ? "הטקסט שנבחר" : "הבחירות כטקסט" }), ...checks];
  }
  if (meta.parts) return meta.parts.map((p) => make({ kind: "text", part: p.key, label: p.label }));
  if (f.type === "long_text") return [make({ kind: "text", label: "טקסט", multiline: true })];
  return [make({ kind: "text", label: "טקסט" })];
}

/**
 * The list groups (one per form field) split by whether everything in them has a stamp yet.
 * A field with several things to place (parts, options) stays pending until all of them are placed.
 */
export function splitPlacement(groups: [string, PlaceableItem[]][], placedKeys: ReadonlySet<string>): { pending: [string, PlaceableItem[]][]; placed: [string, PlaceableItem[]][] } {
  const pending: [string, PlaceableItem[]][] = [];
  const placed: [string, PlaceableItem[]][] = [];
  for (const g of groups) (g[1].every((it) => placedKeys.has(it.key)) ? placed : pending).push(g);
  return { pending, placed };
}

/** `tableRows[tableId]` = how many rows to offer for a repeating table (UI controlled). */
export function placeableItems(def: FormDefinition, tableRows: Record<string, number> = {}): PlaceableItem[] {
  const out: PlaceableItem[] = [];
  for (const f of allFields(def)) {
    if (f.type === "repeating_table") {
      const max = Number(f.settings?.maxRows ?? 10);
      const rows = Math.min(tableRows[f.id] ?? Math.min(max, Math.max(1, Number(f.settings?.minRows ?? 1))), max);
      for (let r = 0; r < rows; r++) {
        for (const col of f.fields ?? []) out.push(...itemsForField(col, `${f.id}[${r}].`, `${f.label} · שורה ${r + 1} · `));
      }
    } else {
      out.push(...itemsForField(f, "", ""));
    }
  }
  return out;
}

/** Stamps whose field (or table column) no longer exists in the form. */
export function orphanStamps(def: FormDefinition, stamps: PdfStamp[]): PdfStamp[] {
  const known = new Set(placeableItems(def, Object.fromEntries(allFields(def).filter((f) => f.type === "repeating_table").map((f) => [f.id, 100]))).map((i) => i.key));
  // Stamps that do not read an answer are never orphans.
  return stamps.filter((s) => s.kind !== "date_signed" && s.kind !== "stamp_image" && !known.has(stampKey(s)));
}

const CELL = /^([A-Za-z]\w*)\[(\d+)\]\.([A-Za-z]\w*)$/;

/** "children[2].name" → { table: "children", row: 2, column: "name" }. */
export function tableCellOf(fieldId: string): { table: string; row: number; column: string } | null {
  const m = CELL.exec(fieldId);
  return m ? { table: m[1]!, row: Number(m[2]), column: m[3]! } : null;
}

/**
 * Repeat the selected cells of one table row on the next `count` rows, `pitch` pt lower each time
 * (a printed table: place row 1, then fill the rest). Cells that are already placed are skipped.
 * Returns only the new stamps; empty when the selection is not one row of one table.
 */
export function replicateTableRow(all: PdfStamp[], selected: PdfStamp[], count: number, pitch: number, newId: () => string): PdfStamp[] {
  const cells = selected.map((s) => ({ s, c: tableCellOf(s.fieldId) }));
  if (cells.length === 0 || cells.some((x) => !x.c)) return [];
  const { table, row } = cells[0]!.c!;
  if (cells.some((x) => x.c!.table !== table || x.c!.row !== row)) return [];
  const taken = new Set(all.map(stampKey));
  const out: PdfStamp[] = [];
  for (let k = 1; k <= count; k++) {
    for (const { s, c } of cells) {
      const copy: PdfStamp = { ...s, id: newId(), fieldId: `${table}[${row + k}].${c!.column}`, y: Math.round((s.y - k * pitch) * 10) / 10 };
      if (copy.y < 0 || taken.has(stampKey(copy))) continue;
      taken.add(stampKey(copy));
      out.push(copy);
    }
  }
  return out;
}

/** Row distance guessed from the selection: the same column one row lower if it is placed, else the row height + 6pt. */
export function guessRowPitch(all: PdfStamp[], selected: PdfStamp[]): number {
  for (const s of selected) {
    const c = tableCellOf(s.fieldId);
    if (!c) continue;
    const next = all.find((o) => o.fieldId === `${c.table}[${c.row + 1}].${c.column}` && o.page === s.page && (o.whenValue ?? "") === (s.whenValue ?? ""));
    if (next && s.y - next.y > 0) return Math.round((s.y - next.y) * 10) / 10;
  }
  return Math.max(...selected.map((s) => s.height)) + 6;
}

/** The top-level field a stamp belongs to (`kids[0].name` → `kids`); stamp-only marks have no field. */
export function stampFieldId(s: PdfStamp): string | null {
  if (s.fieldId.startsWith("_")) return null; // a mark of the document itself (old forms), not of a field
  return s.fieldId.replace(/\[\d+\]\..*$/, "");
}

/** Stamps of fields that are not in the form any more are dropped (a field deleted in the editor takes its boxes along). */
export function pruneStamps(def: FormDefinition, stamps: PdfStamp[]): PdfStamp[] {
  const orphans = new Set(orphanStamps(def, stamps));
  return orphans.size ? stamps.filter((s) => !orphans.has(s)) : stamps;
}

/** Fields that had at least one box before and have none after: deleting the last box deletes the field. */
export function fieldsLeftWithoutStamps(before: PdfStamp[], after: PdfStamp[]): string[] {
  const has = (list: PdfStamp[]) => new Set(list.map(stampFieldId).filter((x): x is string => !!x));
  const now = has(after);
  return [...has(before)].filter((id) => !now.has(id));
}
