/**
 * Draw Hebrew / mixed-direction text onto a pdf-lib page.
 *
 *   const font = await embedHebrewFont(pdfDoc);
 *   drawHebrew(page, "רחוב הרצל 12", { x: 50, y: 700, width: 200, size: 11, font });
 *
 * Coordinates are PDF points with origin at the bottom-left of the page.
 * `x`/`width` describe the field box; text is aligned inside it
 * (default: right for RTL text, left for LTR text).
 */
import fs from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFPage, rgb, type RGB } from "pdf-lib";
import {
  type BaseDirection,
  fontInputForRun,
  resolveDirection,
  toVisualRuns,
  wrapLogical,
} from "./bidi";

export type Align = "right" | "left" | "center";

export interface DrawHebrewOptions {
  x: number;
  y: number;
  width: number;
  size?: number;
  font: PDFFont;
  align?: Align;
  dir?: BaseDirection;
  color?: RGB;
  /** Wrap into multiple lines (going downwards from y). Default false: single line, shrink to fit. */
  multiline?: boolean;
  lineHeight?: number;
  /** For single-line mode: smallest font size allowed when shrinking to fit. */
  minSize?: number;
}

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");

export async function loadFontBytes(weight: "regular" | "bold" = "regular"): Promise<Uint8Array> {
  const file = weight === "bold" ? "Heebo-Bold.ttf" : "Heebo-Regular.ttf";
  return new Uint8Array(await fs.readFile(path.join(FONT_DIR, file)));
}

/**
 * Embed the Hebrew-capable font into a document. Heebo (OFL), static instances
 * generated from the variable font (wght 400/700) — same family as the web UI,
 * lining numerals (Alef was rejected: old-style digits make 0 look like o).
 */
export async function embedHebrewFont(
  doc: PDFDocument,
  weight: "regular" | "bold" = "regular",
): Promise<PDFFont> {
  doc.registerFontkit(fontkit);
  return doc.embedFont(await loadFontBytes(weight), { subset: true });
}

/** Width of a logical-order string as it will be drawn. */
export function measureHebrew(text: string, font: PDFFont, size: number): number {
  return toVisualRuns(text).reduce(
    (sum, run) => sum + font.widthOfTextAtSize(fontInputForRun(run), size),
    0,
  );
}

function drawLine(
  page: PDFPage,
  line: string,
  baselineY: number,
  opts: Required<Pick<DrawHebrewOptions, "x" | "width" | "font" | "color">> & {
    size: number;
    align: Align;
    dir: BaseDirection;
  },
) {
  const runs = toVisualRuns(line, opts.dir);
  const widths = runs.map((r) => opts.font.widthOfTextAtSize(fontInputForRun(r), opts.size));
  const total = widths.reduce((a, b) => a + b, 0);
  let cursor =
    opts.align === "left"
      ? opts.x
      : opts.align === "center"
        ? opts.x + (opts.width - total) / 2
        : opts.x + opts.width - total;
  runs.forEach((run, i) => {
    const w = widths[i] ?? 0;
    if (run.visual.trim().length > 0) {
      page.drawText(fontInputForRun(run), {
        x: cursor,
        y: baselineY,
        size: opts.size,
        font: opts.font,
        color: opts.color,
      });
    }
    cursor += w;
  });
}

/**
 * Draw text in a box. Returns the number of lines drawn.
 */
export function drawHebrew(page: PDFPage, text: string, options: DrawHebrewOptions): number {
  const value = (text ?? "").toString();
  if (value.trim().length === 0) return 0;
  const dir = options.dir ?? "auto";
  const align: Align = options.align ?? (resolveDirection(value, dir) === "rtl" ? "right" : "left");
  const color = options.color ?? rgb(0, 0, 0);
  let size = options.size ?? 10;

  if (!options.multiline) {
    const minSize = options.minSize ?? 6;
    const single = value.replace(/\s*\r?\n\s*/g, " ");
    while (size > minSize && measureHebrew(single, options.font, size) > options.width) {
      size -= 0.5;
    }
    drawLine(page, single, options.y, { ...options, size, align, dir, color });
    return 1;
  }

  const lineHeight = options.lineHeight ?? size * 1.3;
  const lines = wrapLogical(value, options.width, (s) => measureHebrew(s, options.font, size));
  lines.forEach((line, i) => {
    drawLine(page, line, options.y - i * lineHeight, { ...options, size, align, dir, color });
  });
  return lines.length;
}
