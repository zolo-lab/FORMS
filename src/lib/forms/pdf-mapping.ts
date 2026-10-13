/**
 * PDF templates: an uploaded PDF + a list of "stamps" that say where each
 * form answer is drawn. The builder lets the admin drag boxes onto the PDF
 * pages; the result is stored as PdfMapping JSON next to the PDF file.
 *
 * Coordinates: PDF points, origin bottom-left of the page (pdf-lib convention).
 * The builder converts from screen pixels using the page size it renders.
 */
import { PDFDocument, rgb } from "pdf-lib";
import { z } from "zod";
import type { Answers } from "./conditions";
import { formatAnswer } from "./format";
import { allFields, type FormDefinition, type FormField } from "./schema";
import { drawHebrew, embedHebrewFont } from "@/lib/pdf/hebrew";

export const stampSchema = z.object({
  id: z.string(),
  /** Field id. For table cells use "<tableId>[<row>].<columnId>", e.g. "children[0].birthDate". */
  fieldId: z.string(),
  /** Sub-part of a composite answer (bank_account: bank|branch|account; address: city|street|house|apartment|zip). */
  part: z.string().optional(),
  /** For checkboxes/radio/yes_no "check" stamps: draw X only when this option value is selected. */
  whenValue: z.string().optional(),
  kind: z.enum(["text", "check", "signature", "image"]),
  page: z.number().int().nonnegative(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  fontSize: z.number().positive().optional(),
  align: z.enum(["right", "left", "center"]).optional(),
  multiline: z.boolean().optional(),
});
export type PdfStamp = z.infer<typeof stampSchema>;

export const pdfMappingSchema = z.object({
  schemaVersion: z.literal(1),
  /** Page sizes as found when the PDF was uploaded (for builder scaling + sanity checks). */
  pages: z.array(z.object({ width: z.number(), height: z.number() })),
  stamps: z.array(stampSchema),
});
export type PdfMapping = z.infer<typeof pdfMappingSchema>;

/** Resolve "children[0].birthDate" → { field, value }. */
export function resolveStampValue(
  form: FormDefinition,
  answers: Answers,
  fieldId: string,
): { field: FormField; value: unknown } | null {
  const m = /^([A-Za-z][\w]*)\[(\d+)\]\.([A-Za-z][\w]*)$/.exec(fieldId);
  if (m) {
    const [, tableId, rowStr, colId] = m;
    const table = allFields(form).find((f) => f.id === tableId);
    const col = table?.fields?.find((f) => f.id === colId);
    if (!table || !col) return null;
    const rows = answers[tableId!] as Answers[] | undefined;
    return { field: col, value: rows?.[Number(rowStr)]?.[colId!] };
  }
  const field = allFields(form).find((f) => f.id === fieldId);
  return field ? { field, value: answers[fieldId] } : null;
}

function isChecked(field: FormField, value: unknown, whenValue?: string): boolean {
  if (whenValue === undefined) return value === true || value === "yes";
  if (Array.isArray(value)) return value.includes(whenValue);
  return String(value) === whenValue;
}

async function embedImage(doc: PDFDocument, src: string) {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(src);
  if (!m) return null;
  const bytes = Buffer.from(m[2]!, "base64");
  return m[1] === "png" ? doc.embedPng(bytes) : doc.embedJpg(bytes);
}

/**
 * Stamp answers onto a template PDF. Returns the new PDF bytes.
 * Signature values must be data URLs (data:image/png;base64,...); fetch remote
 * images before calling.
 */
export async function stampPdf(
  templateBytes: Uint8Array,
  mapping: PdfMapping,
  form: FormDefinition,
  answers: Answers,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(templateBytes);
  const font = await embedHebrewFont(doc);
  const pages = doc.getPages();

  for (const stamp of mapping.stamps) {
    const page = pages[stamp.page];
    if (!page) continue;
    const resolved = resolveStampValue(form, answers, stamp.fieldId);
    if (!resolved) continue;
    const { field, value } = resolved;

    if (stamp.kind === "check") {
      if (isChecked(field, value, stamp.whenValue)) {
        const size = Math.min(stamp.width, stamp.height);
        page.drawText("X", {
          x: stamp.x + (stamp.width - font.widthOfTextAtSize("X", size)) / 2,
          y: stamp.y + size * 0.15,
          size,
          font,
          color: rgb(0, 0, 0),
        });
      }
      continue;
    }

    if (stamp.kind === "signature" || stamp.kind === "image") {
      const src = (value as { image?: string } | undefined)?.image ?? (typeof value === "string" ? value : undefined);
      if (!src) continue;
      const img = await embedImage(doc, src);
      if (!img) continue;
      const scale = Math.min(stamp.width / img.width, stamp.height / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      page.drawImage(img, {
        x: stamp.x + (stamp.width - w) / 2,
        y: stamp.y + (stamp.height - h) / 2,
        width: w,
        height: h,
      });
      continue;
    }

    const text = formatAnswer(field, value, stamp.part);
    if (!text) continue;
    const size = stamp.fontSize ?? Math.min(11, stamp.height * 0.75);
    drawHebrew(page, text, {
      x: stamp.x,
      // Baseline: vertically centre a single line inside the box.
      y: stamp.multiline ? stamp.y + stamp.height - size : stamp.y + (stamp.height - size) / 2 + size * 0.2,
      width: stamp.width,
      size,
      font,
      align: stamp.align,
      multiline: stamp.multiline,
    });
  }

  return doc.save();
}
