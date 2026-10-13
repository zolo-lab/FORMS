/**
 * Renders all Hebrew test cases into artifacts/hebrew-sample.pdf for human review.
 * Left column: expected visual string (drawn glyph-by-glyph, independent of the
 * bidi pipeline). Right column: drawHebrew(logical text). They must look identical.
 * Run: pnpm pdf:sample
 */
import fs from "node:fs/promises";
import { PDFDocument, rgb } from "pdf-lib";
import { drawHebrew, embedHebrewFont } from "../src/lib/pdf/hebrew";
import { HEBREW_CASES } from "../tests/hebrew-cases";

async function main() {
  const doc = await PDFDocument.create();
  const font = await embedHebrewFont(doc);
  const bold = await embedHebrewFont(doc, "bold");
  let page = doc.addPage([595, 842]);
  let y = 800;
  drawHebrew(page, "בדיקת עברית ב-PDF: עמודה ימנית = drawHebrew, עמודה שמאלית = הצפוי", {
    x: 30, y, width: 535, size: 12, font: bold,
  });
  y -= 30;
  for (const c of HEBREW_CASES) {
    if (y < 80) {
      page = doc.addPage([595, 842]);
      y = 800;
    }
    page.drawLine({ start: { x: 30, y: y - 6 }, end: { x: 565, y: y - 6 }, thickness: 0.3, color: rgb(0.8, 0.8, 0.8) });
    drawHebrew(page, c.name, { x: 470, y, width: 95, size: 8, font, color: rgb(0.45, 0.45, 0.45) });
    const lines = drawHebrew(page, c.text, { x: 250, y, width: 210, size: 11, font, multiline: true });
    if (c.visual !== undefined) {
      // Expected: draw each glyph individually left→right (no bidi involved).
      let x = 30;
      for (const ch of c.visual) {
        page.drawText(ch, { x, y, size: 11, font, color: rgb(0, 0.35, 0.7) });
        x += font.widthOfTextAtSize(ch, 11);
      }
    }
    y -= Math.max(1, lines) * 15 + 12;
  }
  await fs.mkdir("artifacts", { recursive: true });
  await fs.writeFile("artifacts/hebrew-sample.pdf", await doc.save());
  console.log("wrote artifacts/hebrew-sample.pdf");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
