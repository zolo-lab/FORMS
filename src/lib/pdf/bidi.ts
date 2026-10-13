/**
 * Bidirectional (Hebrew/English/numbers) text helpers for drawing on PDFs.
 *
 * Why this exists: pdf-lib draws glyphs strictly left-to-right, and its font
 * layer (fontkit) reverses any string that contains Hebrew letters. Drawing a
 * logical-order Hebrew string as-is therefore breaks mixed text
 * (e.g. "רחוב הרצל 12" comes out with "21").
 *
 * Approach:
 *  1. Run the Unicode Bidi Algorithm (bidi-js) on the logical string.
 *  2. Mirror brackets per the algorithm, then reorder into *visual* order
 *     (the order glyphs appear from left to right on the page).
 *  3. Split the visual string into runs: pure Hebrew-letter runs vs. everything
 *     else. Hebrew runs are handed to the font reversed back, because fontkit
 *     will reverse them again. Other runs are drawn exactly as-is.
 *
 * Everything here is pure and unit-tested (tests/bidi.test.ts).
 */
import bidiFactory from "bidi-js";

const bidi = bidiFactory();

export type BaseDirection = "rtl" | "ltr" | "auto";

/** A piece of text in visual (left-to-right on the page) order. */
export interface VisualRun {
  /** Characters exactly as they must appear left→right on the page. */
  visual: string;
  /** True when the run consists of Hebrew letters (font will reverse it). */
  hebrew: boolean;
}

const HEBREW_LETTER = /[֐-׿יִ-ﭏ]/;
const STRONG_LTR = /[A-Za-zÀ-ɏ]/;

export function isHebrewChar(ch: string): boolean {
  return HEBREW_LETTER.test(ch);
}

export function hasHebrew(text: string): boolean {
  return HEBREW_LETTER.test(text);
}

/**
 * Resolve 'auto' direction for Hebrew documents: any Hebrew letter makes the
 * line RTL (so "Gmail של העובד" reads correctly in a Hebrew form). Pure
 * Latin text is LTR. Text with no strong characters at all
 * (e.g. "050-1234567") defaults to RTL.
 */
export function resolveDirection(text: string, dir: BaseDirection = "auto"): "rtl" | "ltr" {
  if (dir !== "auto") return dir;
  if (hasHebrew(text)) return "rtl";
  if (STRONG_LTR.test(text)) return "ltr";
  return "rtl";
}

/**
 * Convert a single line of logical text into visual order.
 * Returns a string whose characters are in left→right page order.
 */
export function toVisual(text: string, dir: BaseDirection = "auto"): string {
  if (text.length === 0) return "";
  const base = resolveDirection(text, dir);
  const levels = bidi.getEmbeddingLevels(text, base);
  // UTF-16 code units: bidi-js indices are code-unit based.
  const chars = text.split("");
  // Mirror first (indices refer to original positions).
  const mirrored = bidi.getMirroredCharactersMap(text, levels);
  mirrored.forEach((replacement, index) => {
    chars[index] = replacement;
  });
  const flips = bidi.getReorderSegments(text, levels);
  for (const [start, end] of flips) {
    const slice = chars.slice(start, end + 1).reverse();
    chars.splice(start, slice.length, ...slice);
  }
  return chars.join("");
}

/** Split a visual-order string into Hebrew-letter runs and other runs. */
export function splitVisualRuns(visual: string): VisualRun[] {
  const runs: VisualRun[] = [];
  for (const ch of visual) {
    const hebrew = isHebrewChar(ch);
    const last = runs[runs.length - 1];
    if (last && last.hebrew === hebrew) {
      last.visual += ch;
    } else {
      runs.push({ visual: ch, hebrew });
    }
  }
  return runs;
}

/** Visual runs for one logical line. */
export function toVisualRuns(text: string, dir: BaseDirection = "auto"): VisualRun[] {
  return splitVisualRuns(toVisual(text, dir));
}

/**
 * The string to hand to pdf-lib for a run. fontkit reverses strings containing
 * Hebrew, so Hebrew runs are pre-reversed to cancel that out.
 */
export function fontInputForRun(run: VisualRun): string {
  return run.hebrew ? Array.from(run.visual).reverse().join("") : run.visual;
}

/**
 * Word-wrap logical text to a max width. Wrapping is done in logical order
 * (before visual reordering), each line is then visualised separately.
 * Explicit newlines are respected.
 */
export function wrapLogical(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/(\s+)/).filter((w) => w.length > 0);
    let line = "";
    for (const word of words) {
      const candidate = line + word;
      if (line.trim().length > 0 && measure(candidate.trimEnd()) > maxWidth && word.trim().length > 0) {
        out.push(line.trimEnd());
        line = word.trimStart();
      } else {
        line = candidate;
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}
