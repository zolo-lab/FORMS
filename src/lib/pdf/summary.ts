/** Fallback final document for forms without an uploaded PDF: a plain Hebrew summary of the answers. */
import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import type { Answers } from "@/lib/forms/conditions";
import { FIELD_TYPE_META } from "@/lib/forms/field-types";
import { formatAnswer } from "@/lib/forms/format";
import { allFields, type FormDefinition } from "@/lib/forms/schema";
import { drawHebrew, embedHebrewFont } from "./hebrew";

export interface SummaryItem {
  label: string;
  text: string;
}

/** Pure: label/value pairs for every answered, visible-in-summary field. Signatures show as "חתום". */
export function summaryItems(def: FormDefinition, answers: Answers): SummaryItem[] {
  const out: SummaryItem[] = [];
  for (const f of allFields(def)) {
    if (!FIELD_TYPE_META[f.type].hasAnswer) continue;
    const v = answers[f.id];
    if (v === undefined || v === null || v === "") continue;
    const text = f.type === "signature" ? "חתום" : formatAnswer(f, v);
    if (text) out.push({ label: f.label || f.id, text });
  }
  return out;
}

export async function summaryPdf(title: string, items: SummaryItem[]): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  const font = await embedHebrewFont(doc);
  const bold = await embedHebrewFont(doc, "bold");
  let page: PDFPage = doc.addPage([595, 842]);
  let y = 790;
  drawHebrew(page, title, { x: 40, y, width: 515, size: 18, font: bold });
  y -= 30;
  for (const it of items) {
    if (y < 70) {
      page = doc.addPage([595, 842]);
      y = 790;
    }
    page.drawLine({ start: { x: 40, y: y - 6 }, end: { x: 555, y: y - 6 }, thickness: 0.3, color: rgb(0.8, 0.8, 0.8) });
    drawHebrew(page, it.label, { x: 355, y, width: 200, size: 10, font: bold });
    const lines = drawHebrew(page, it.text, { x: 40, y, width: 305, size: 10, font, multiline: true });
    y -= Math.max(1, lines) * 14 + 10;
  }
  return doc;
}
