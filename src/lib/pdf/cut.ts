/**
 * Cutting pages out of a signed PDF into a document of their own ("עיבוד טופס").
 * The source is the stamped PDF **before** the certificate page is appended, so a part comes out clean:
 * what the employee signed, and nothing else bolted on.
 */
import { PDFDocument } from "pdf-lib";
import { parsePages } from "@/lib/processing/pages";

/**
 * `spec` is a page range as the builder wrote it ("1-2,5"), 1-based.
 * Throws when the spec names no page of this document — a part that would be an empty PDF is a mistake,
 * not something to file silently.
 */
export async function cutPages(bytes: Uint8Array, spec: string): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes);
  const { pages, errors } = parsePages(spec, src.getPageCount());
  if (errors.length) throw new Error(`bad page range "${spec}": ${errors.join("; ")}`);
  if (!pages.length) throw new Error(`page range "${spec}" selects no page`);
  const out = await PDFDocument.create();
  // pdf-lib is 0-based; the spec the admin writes is 1-based.
  const copied = await out.copyPages(src, pages.map((p) => p - 1));
  for (const page of copied) out.addPage(page);
  return out.save();
}
