/**
 * Cutting pages out of a signed PDF into a document of their own ("עיבוד טופס").
 * Cutting happens on the way out, when a destination sends a part — a part is never stored as a document of
 * the request. `sourcePages` keeps the certificate page out of an open range, so a part is what people signed
 * and nothing else bolted on.
 */
import { PDFDocument } from "pdf-lib";
import { parsePages } from "@/lib/processing/pages";

/**
 * `spec` is a page range as the builder wrote it ("1-2,5"), 1-based.
 * Throws when the spec names no page of this document — a part that would be an empty PDF is a mistake,
 * not something to file silently.
 */
export async function cutPages(bytes: Uint8Array, spec: string, sourcePages?: number): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes);
  // The signed file ends with a certificate page. `sourcePages` is the form's own length, so an open range
  // ("3-") stops at the end of the form instead of sweeping the certificate into the part.
  const limit = sourcePages && sourcePages > 0 ? Math.min(sourcePages, src.getPageCount()) : src.getPageCount();
  const { pages, errors } = parsePages(spec, limit);
  if (errors.length) throw new Error(`bad page range "${spec}": ${errors.join("; ")}`);
  if (!pages.length) throw new Error(`page range "${spec}" selects no page`);
  const out = await PDFDocument.create();
  // pdf-lib is 0-based; the spec the admin writes is 1-based.
  const copied = await out.copyPages(src, pages.map((p) => p - 1));
  for (const page of copied) out.addPage(page);
  return out.save();
}
