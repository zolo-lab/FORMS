/** The reference ("אסמכתא") page appended to every final PDF: who signed what, when, and the document hash. */
import { PDFDocument, rgb } from "pdf-lib";
import { ROLE_LABELS, STEP_STATUS_LABEL } from "@/lib/workflow/labels";
import type { StepRole } from "@/lib/workflow/types";
import { drawHebrew, embedHebrewFont } from "./hebrew";

export interface CertificateStep {
  role: string;
  name: string;
  status: string;
  completedAt: Date | null;
  ip?: string | null;
}

export interface CertificateData {
  requestId: string;
  organization: string;
  subject: string;
  documentTitle: string;
  /** sha256 (hex) of the document as it was before this page was added. */
  documentSha256: string;
  generatedAt: Date;
  steps: CertificateStep[];
}

export interface CertificateRow {
  group: "fact" | "step";
  label: string;
  value: string;
}

const fmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" });
const fmtDate = (d: Date) => fmt.format(d).replace(/\//g, ".").replace(",", "");

/** Pure: the text the page shows, so it can be unit-tested without rendering. */
export function certificateRows(d: CertificateData): CertificateRow[] {
  const facts: CertificateRow[] = [
    { group: "fact", label: "ארגון", value: d.organization },
    { group: "fact", label: "שם הנחתם / הנושא", value: d.subject },
    { group: "fact", label: "מסמך", value: d.documentTitle },
    { group: "fact", label: "מזהה בקשה", value: d.requestId },
    { group: "fact", label: "נוצר", value: fmtDate(d.generatedAt) },
    { group: "fact", label: "SHA-256 של תוכן המסמך (ללא עמוד האסמכתא)", value: d.documentSha256 },
  ];
  const steps = d.steps.map<CertificateRow>((s) => ({
    group: "step",
    label: `${ROLE_LABELS[s.role as StepRole] ?? s.role}${s.name ? ` – ${s.name}` : ""}`,
    value: `${STEP_STATUS_LABEL[s.status] ?? s.status} · ${s.completedAt ? fmtDate(s.completedAt) : "—"} · IP ${s.ip ?? "—"}`,
  }));
  return [...facts, ...steps];
}

export async function appendCertificate(doc: PDFDocument, data: CertificateData): Promise<void> {
  const font = await embedHebrewFont(doc);
  const bold = await embedHebrewFont(doc, "bold");
  const page = doc.addPage([595, 842]);
  const left = 40;
  const width = 515;
  let y = 790;
  drawHebrew(page, "אסמכתא לחתימה אלקטרונית", { x: left, y, width, size: 18, font: bold });
  y -= 14;
  page.drawLine({ start: { x: left, y }, end: { x: left + width, y }, thickness: 0.8, color: rgb(0.3, 0.3, 0.3) });
  y -= 26;
  let inSteps = false;
  for (const row of certificateRows(data)) {
    if (row.group === "step" && !inSteps) {
      inSteps = true;
      y -= 8;
      drawHebrew(page, "שלבי החתימה", { x: left, y, width, size: 13, font: bold });
      y -= 22;
    }
    // Label on the right (RTL page), value to its left.
    drawHebrew(page, row.label, { x: left + 330, y, width: 185, size: 10, font: bold });
    const lines = drawHebrew(page, row.value, { x: left, y, width: 320, size: 10, font, multiline: true });
    y -= Math.max(1, lines) * 14 + 8;
  }
  drawHebrew(page, "מסמך זה נחתם אלקטרונית. ערך ה-SHA-256 שלמעלה מחושב על המסמך לפני הוספת עמוד זה; טביעת האצבע של הקובץ המלא נשמרת במערכת.", { x: left, y: 60, width, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
}
