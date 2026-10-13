/**
 * Renders all Hebrew test cases into artifacts/hebrew-sample.pdf for human review.
 * Left column: expected visual string (drawn glyph-by-glyph, independent of the
 * bidi pipeline). Right column: drawHebrew(logical text). They must look identical.
 * Run: pnpm pdf:sample
 */
import fs from "node:fs/promises";
import { PDFDocument, rgb } from "pdf-lib";
import { pdfMappingSchema, stampPdf } from "../src/lib/forms/pdf-mapping";
import { appendCertificate } from "../src/lib/pdf/certificate";
import { drawHebrew, embedHebrewFont } from "../src/lib/pdf/hebrew";
import { HEBREW_CASES } from "../tests/hebrew-cases";
import { sampleForm, validAnswers } from "../tests/fixtures/sample-form";

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

  // Reference page, rendered to PNG by CI for review.
  const cert = await PDFDocument.create();
  await appendCertificate(cert, {
    requestId: "5b1c7d52-0d4e-4a52-9a43-3f6b9d6a7c11",
    organization: "שיבת ציון",
    subject: "דנה כהן-לוי",
    documentTitle: "טופס 101 – כרטיס עובד",
    documentSha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    generatedAt: new Date("2026-10-13T12:00:00Z"),
    steps: [
      { role: "employee", name: "דנה כהן-לוי", status: "completed", completedAt: new Date("2026-10-13T09:30:00Z"), ip: "203.0.113.5" },
      { role: "approver", name: "יוסי מנהל", status: "completed", completedAt: new Date("2026-10-13T10:15:00Z"), ip: "198.51.100.7" },
      { role: "payroll", name: "חשבות שכר", status: "completed", completedAt: new Date("2026-10-13T11:00:00Z"), ip: null },
    ],
  });
  await fs.writeFile("artifacts/certificate-sample.pdf", await cert.save());
  console.log("wrote artifacts/certificate-sample.pdf");

  // Stamp kinds on a blank 2-page template, rendered to PNG by CI for review.
  const tpl = await PDFDocument.create();
  tpl.addPage([595, 842]);
  tpl.addPage([595, 842]);
  const mapping = pdfMappingSchema.parse({
    schemaVersion: 1,
    pages: [{ width: 595, height: 842 }, { width: 595, height: 842 }],
    stamps: [
      { id: "id", fieldId: "idNumber", kind: "comb", page: 0, x: 300, y: 760, width: 225, height: 22, comb: { cells: 9 } },
      { id: "nm", fieldId: "firstName", kind: "text", page: 0, x: 300, y: 720, width: 225, height: 22, bold: true, color: "#1a3c8c" },
      { id: "cb", fieldId: "firstName", kind: "comb", page: 0, x: 300, y: 680, width: 225, height: 22, comb: { cells: 9 } },
      { id: "dt", fieldId: "firstName", kind: "date_signed", page: 0, x: 60, y: 720, width: 100, height: 22 },
      { id: "in", fieldId: "firstName", kind: "initials", page: 0, repeatOnPages: [1], x: 500, y: 30, width: 60, height: 22, valign: "bottom" },
    ],
  });
  for (const st of mapping.stamps) {
    if (st.kind === "comb") {
      for (let i = 0; i < (st.comb?.cells ?? 0); i++) {
        const w = st.width / (st.comb?.cells ?? 1);
        tpl.getPage(0).drawRectangle({ x: st.x + i * w, y: st.y, width: w, height: st.height, borderWidth: 0.5, borderColor: rgb(0.5, 0.5, 0.5) });
      }
    }
  }
  const stamped = await stampPdf(await tpl.save(), mapping, sampleForm, validAnswers, { signedAt: new Date("2026-10-13T09:00:00Z") });
  await fs.writeFile("artifacts/stamps-sample.pdf", stamped);
  console.log("wrote artifacts/stamps-sample.pdf");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
