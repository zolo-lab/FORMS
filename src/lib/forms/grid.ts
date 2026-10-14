/** `grid`: a fixed table of typed cells (text / number / dropdown / date). Pure helpers shared by validate, renderer and builder. */
import type { FieldOption, FormField } from "./schema";

export const GRID_CELL_TYPES = ["text", "number", "dropdown", "date"] as const;
export type GridCellType = (typeof GRID_CELL_TYPES)[number];
export const GRID_CELL_LABELS: Record<GridCellType, string> = { text: "טקסט", number: "מספר", dropdown: "רשימה", date: "תאריך" };

export interface GridColumn extends FieldOption {
  type?: GridCellType;
  /** dropdown cells */
  options?: FieldOption[];
}

export function gridRows(field: FormField): FieldOption[] {
  return (field.settings?.rows as FieldOption[] | undefined) ?? [];
}
export function gridColumns(field: FormField): GridColumn[] {
  return (field.settings?.columns as GridColumn[] | undefined) ?? [];
}

export type GridAnswer = Record<string, Record<string, string | number>>;

export function isGridAnswer(v: unknown): v is GridAnswer {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Checks every cell against its column type. Returns the error message, or null and the cleaned answer
 * (numbers as numbers, blanks dropped). `required` demands a value in every cell.
 */
export function validateGrid(field: FormField, value: unknown): { error: string | null; cleaned: GridAnswer } {
  const cleaned: GridAnswer = {};
  if (!isGridAnswer(value)) return { error: "יש למלא את הטבלה", cleaned };
  const cols = gridColumns(field);
  for (const r of gridRows(field)) {
    const row = (value[r.value] ?? {}) as Record<string, unknown>;
    const out: Record<string, string | number> = {};
    for (const c of cols) {
      const raw = row[c.value];
      const blank = raw === undefined || raw === null || String(raw).trim() === "";
      if (blank) {
        if (field.required) return { error: `יש למלא את "${r.label}" – "${c.label}"`, cleaned };
        continue;
      }
      switch (c.type ?? "text") {
        case "number": {
          const n = Number(String(raw).replace(/,/g, ""));
          if (!Number.isFinite(n)) return { error: `"${r.label}" – "${c.label}": יש להזין מספר`, cleaned };
          out[c.value] = n;
          break;
        }
        case "date":
          if (!DATE.test(String(raw))) return { error: `"${r.label}" – "${c.label}": תאריך לא תקין`, cleaned };
          out[c.value] = String(raw);
          break;
        case "dropdown":
          if (c.options?.length && !c.options.some((o) => o.value === raw)) return { error: `"${r.label}" – "${c.label}": ערך לא מהרשימה`, cleaned };
          out[c.value] = String(raw);
          break;
        default:
          out[c.value] = String(raw);
      }
    }
    if (Object.keys(out).length) cleaned[r.value] = out;
  }
  return { error: null, cleaned };
}

/** One-line summary: "שורה: עמודה=ערך, …; …". */
export function formatGrid(field: FormField, value: unknown): string {
  if (!isGridAnswer(value)) return "";
  const cols = gridColumns(field);
  return gridRows(field)
    .map((r) => {
      const row = value[r.value];
      if (!row) return "";
      const cells = cols.filter((c) => row[c.value] !== undefined && row[c.value] !== "").map((c) => {
        const v = row[c.value];
        const label = c.type === "dropdown" ? (c.options?.find((o) => o.value === v)?.label ?? v) : v;
        return `${c.label}=${label}`;
      });
      return cells.length ? `${r.label}: ${cells.join(", ")}` : "";
    })
    .filter(Boolean)
    .join("; ");
}
