/** Pure helpers for stamping answers onto a PDF (no pdf-lib dependency, easy to unit test). */
import { rgb, type RGB } from "pdf-lib";
import { resolveDirection } from "./bidi";

export const DATE_FORMATS = ["dd/mm/yyyy", "dd.mm.yyyy", "yyyy-mm-dd"] as const;
export type StampDateFormat = (typeof DATE_FORMATS)[number];

/** Format a date as Israel local time (the signing happens there). */
export function formatStampDate(date: Date, format: StampDateFormat = "dd/mm/yyyy"): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const [d, m, y] = [get("day"), get("month"), get("year")];
  if (format === "dd.mm.yyyy") return `${d}.${m}.${y}`;
  if (format === "yyyy-mm-dd") return `${y}-${m}-${d}`;
  return `${d}/${m}/${y}`;
}

/** First letter of each word: "ישראל ישראלי" → "י.י." */
export function initialsOf(name: string): string {
  const words = name.trim().split(/[\s\-־]+/).filter(Boolean);
  return words.map((w) => `${Array.from(w)[0]}.`).join("");
}

export interface CombCell {
  char: string;
  /** Left edge of the cell, relative to the stamp's x. */
  x: number;
  width: number;
}

/**
 * Split a value into boxes, one character per box.
 * Direction follows the text: RTL text starts in the rightmost box, LTR (digits, Latin) in the leftmost.
 * Surplus characters are dropped; unused boxes stay empty.
 */
export function combCells(text: string, totalWidth: number, cells?: number): CombCell[] {
  const chars = Array.from(text.replace(/\s+/g, ""));
  const count = Math.max(1, cells ?? chars.length);
  const cellWidth = totalWidth / count;
  const rtl = resolveDirection(text) === "rtl";
  return chars.slice(0, count).map((char, i) => ({
    char,
    x: (rtl ? count - 1 - i : i) * cellWidth,
    width: cellWidth,
  }));
}

/** "#rrggbb" → pdf-lib colour; anything else is black. */
export function parseHexColor(hex: string | undefined): RGB {
  const m = /^#([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return rgb(0, 0, 0);
  const n = parseInt(m[1]!, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export type VAlign = "top" | "middle" | "bottom";

/** Baseline for a single line of text of `size` inside a box (PDF coordinates, origin bottom-left). */
export function baselineY(box: { y: number; height: number }, size: number, valign: VAlign = "middle"): number {
  if (valign === "top") return box.y + box.height - size * 0.85;
  if (valign === "bottom") return box.y + size * 0.2;
  return box.y + (box.height - size) / 2 + size * 0.2;
}

/** Pages (0-based) a stamp is drawn on: its own page plus `repeatOnPages`, deduped, within the document. */
export function targetPages(page: number, repeat: number[] | undefined, pageCount: number): number[] {
  const set = new Set<number>([page, ...(repeat ?? [])]);
  return [...set].filter((p) => p >= 0 && p < pageCount).sort((a, b) => a - b);
}
