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
import {
  baselineY,
  combCells,
  DATE_FORMATS,
  formatStampDate,
  initialsOf,
  parseHexColor,
  targetPages,
} from "@/lib/pdf/stamp-helpers";

export const stampSchema = z.object({
  id: z.string(),
  /** Field id. For table cells use "<tableId>[<row>].<columnId>", e.g. "children[0].birthDate". */
  fieldId: z.string(),
  /** Sub-part of a composite answer (bank_account: bank|branch|account; address: city|street|house|apartment|zip). */
  part: z.string().optional(),
  /** For checkboxes/radio/yes_no "check" stamps: draw X only when this option value is selected. */
  whenValue: z.string().optional(),
  /**
   * text: the answer as text · comb: one character per box · check: X when selected ·
   * signature/image: drawn image · date_signed: the date the step was completed ·
   * initials: first letters of a name answer · stamp_image: a fixed image (organisation stamp).
   */
  kind: z.enum(["text", "check", "signature", "image", "comb", "date_signed", "initials", "stamp_image"]),
  page: z.number().int().nonnegative(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  fontSize: z.number().positive().optional(),
  align: z.enum(["right", "left", "center"]).optional(),
  multiline: z.boolean().optional(),
  valign: z.enum(["top", "middle", "bottom"]).optional(),
  bold: z.boolean().optional(),
  /** "#rrggbb" */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  /** Extra pages (0-based) the same stamp is drawn on, e.g. initials on every page. */
  repeatOnPages: z.array(z.number().int().nonnegative()).optional(),
  /** comb: number of boxes (default: length of the value). */
  comb: z.object({ cells: z.number().int().min(1).max(40) }).optional(),
  dateFormat: z.enum(DATE_FORMATS).optional(),
  /** Which signing role fills/owns this stamp (used for colouring and "fill on document"). */
  role: z.string().optional(),
  /** stamp_image: data URL (png/jpg) of the fixed image. */
  image: z.string().optional(),
  tabIndex: z.number().int().optional(),
  /** Suggested by the automatic placement and not confirmed yet; the editor draws it dashed. */
  guessed: z.boolean().optional(),
});
export type PdfStamp = z.infer<typeof stampSchema>;

export const pdfMappingSchema = z.object({
  schemaVersion: z.literal(1),
  /** Page sizes as found when the PDF was uploaded (for builder scaling + sanity checks). */
  pages: z.array(z.object({ width: z.number(), height: z.number() })),
  stamps: z.array(stampSchema),
  /** The template has interactive AcroForm fields that were imported as stamps; they are flattened when stamping. */
  acroImported: z.boolean().optional(),
});
export type PdfMapping = z.infer<typeof pdfMappingSchema>;

/**
 * What goes into comb boxes. Dates and phone numbers lose their separators: forms print the "/" or "-" themselves
 * (form 101: dd mm yyyy in 8 boxes).
 */
export function combText(field: FormField, text: string): string {
  if (field.type === "date" || field.type === "phone") return text.replace(/\D/g, "");
  return text;
}

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

/** Lucide "paperclip" outline (24×24), drawn for an attached document. */
const PAPERCLIP = "M13.234 20.252 21 12.3M16 6l-8.414 8.586a2 2 0 0 0 0 2.828 2 2 0 0 0 2.828 0l8.414-8.586a4 4 0 0 0 0-5.656 4 4 0 0 0-5.656 0l-8.415 8.585a6 6 0 1 0 8.486 8.486";

function isChecked(field: FormField, value: unknown, whenValue?: string): boolean {
  if (field.type === "file_upload") return Array.isArray(value) && value.length > 0;
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

export interface StampContext {
  /** When the signer completed their step; used by `date_signed`. Defaults to now. */
  signedAt?: Date;
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
  ctx: StampContext = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(templateBytes);
  const font = await embedHebrewFont(doc);
  if (mapping.acroImported) {
    // The imported fields are re-drawn as stamps, so the interactive widgets must not stay on top.
    const form = doc.getForm();
    try {
      form.flatten();
    } catch {
      for (const f of form.getFields()) form.removeField(f);
    }
  }
  const pages = doc.getPages();

  for (const stamp of mapping.stamps) {
    const targets = targetPages(stamp.page, stamp.repeatOnPages, pages.length)
      .map((i) => pages[i])
      .filter((p): p is NonNullable<typeof p> => !!p);
    if (targets.length === 0) continue;
    const color = parseHexColor(stamp.color);

    const drawText = (page: (typeof targets)[number], text: string, box = stamp, opts: { align?: PdfStamp["align"]; multiline?: boolean } = {}) => {
      if (!text) return;
      const size = box.fontSize ?? Math.min(11, box.height * 0.75);
      const multiline = opts.multiline ?? box.multiline;
      const y = multiline ? box.y + box.height - size : baselineY(box, size, box.valign);
      const base = { x: box.x, y, width: box.width, size, font, align: opts.align ?? box.align, multiline, color };
      drawHebrew(page, text, base);
      // The embedded font has one weight; thicken strokes by a second pass offset by a hair.
      if (stamp.bold) drawHebrew(page, text, { ...base, x: base.x + size * 0.03 });
    };

    // Kinds that do not read an answer.
    if (stamp.kind === "date_signed") {
      const text = formatStampDate(ctx.signedAt ?? new Date(), stamp.dateFormat);
      for (const page of targets) drawText(page, text, stamp, { align: stamp.align ?? "center" });
      continue;
    }
    if (stamp.kind === "stamp_image") {
      const img = stamp.image ? await embedImage(doc, stamp.image) : null;
      if (!img) continue;
      const scale = Math.min(stamp.width / img.width, stamp.height / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      for (const page of targets) {
        page.drawImage(img, { x: stamp.x + (stamp.width - w) / 2, y: stamp.y + (stamp.height - h) / 2, width: w, height: h });
      }
      continue;
    }

    const resolved = resolveStampValue(form, answers, stamp.fieldId);
    if (!resolved) continue;
    const { field, value } = resolved;

    if (stamp.kind === "check" && field.type === "file_upload") {
      // An attached document: a small paperclip in the box.
      if (isChecked(field, value)) {
        const k = Math.min(stamp.width, stamp.height) / 24;
        for (const page of targets) {
          page.drawSvgPath(PAPERCLIP, { x: stamp.x + (stamp.width - 24 * k) / 2, y: stamp.y + (stamp.height + 24 * k) / 2, scale: k, borderColor: color ?? rgb(0, 0, 0), borderWidth: 1.2 });
        }
      }
      continue;
    }

    if (stamp.kind === "check") {
      if (isChecked(field, value, stamp.whenValue)) {
        const size = Math.min(stamp.width, stamp.height);
        for (const page of targets) {
          page.drawText("X", {
            x: stamp.x + (stamp.width - font.widthOfTextAtSize("X", size)) / 2,
            y: stamp.y + size * 0.15,
            size,
            font,
            color,
          });
        }
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
      for (const page of targets) {
        page.drawImage(img, {
          x: stamp.x + (stamp.width - w) / 2,
          y: stamp.y + (stamp.height - h) / 2,
          width: w,
          height: h,
        });
      }
      continue;
    }

    const text = formatAnswer(field, value, stamp.part);
    if (!text) continue;

    if (stamp.kind === "comb") {
      const cellsText = combText(field, text);
      const size = stamp.fontSize ?? Math.min(11, stamp.height * 0.75);
      for (const page of targets) {
        for (const cell of combCells(cellsText, stamp.width, stamp.comb?.cells)) {
          drawText(page, cell.char, { ...stamp, x: stamp.x + cell.x, width: cell.width, fontSize: size }, { align: "center", multiline: false });
        }
      }
      continue;
    }

    const out = stamp.kind === "initials" ? initialsOf(text) : text;
    for (const page of targets) drawText(page, out);
  }

  return doc.save();
}
