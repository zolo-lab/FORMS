/**
 * Writes the page data detection works on (GuessPage[]: labels + shapes, as the PDF tab reads them in the browser)
 * for a PDF, so detection can be tested on a real form without opening the PDF in CI.
 *   pnpm tsx scripts/dump-page-data.ts <file.pdf> <out.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractShapes, type OpCodes } from "../src/lib/pdf/geometry";
import { groupLabels, splitGlyphs, textItems } from "../src/lib/pdf/labels";
import type { GuessPage } from "../src/lib/pdf/guess";

async function main() {
  const [file, out] = process.argv.slice(2);
  if (!file || !out) throw new Error("usage: dump-page-data <file.pdf> <out.json>");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), useSystemFonts: false }).promise;
  const pages: GuessPage[] = [];
  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1);
    const [content, ops] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
    const { items, squares } = splitGlyphs(textItems(content.items.filter((it): it is Extract<typeof it, { str: string }> => "str" in it)));
    const shapes = extractShapes(ops, pdfjs.OPS as unknown as OpCodes);
    pages.push({
      index: i,
      width: page.view[2]! - page.view[0]!,
      height: page.view[3]! - page.view[1]!,
      labels: groupLabels(i, items),
      shapes: { ...shapes, checkboxes: [...shapes.checkboxes, ...squares] },
    });
  }
  writeFileSync(out, JSON.stringify(pages));
  console.log(`${pages.length} pages → ${out}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
