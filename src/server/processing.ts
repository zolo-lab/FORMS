/**
 * "עיבוד טופס" at the end of a request: cutting each signed document into the parts the form defines
 * (101 to payroll, the employment agreement to the personal file).
 *
 * Cut from the stamped PDF **before** the certificate page is appended, so a part is exactly the pages the
 * people signed — the whole document keeps its certificate, a part comes out clean.
 */
import { and, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { cutPages } from "@/lib/pdf/cut";
import { normalizeProcessing } from "@/lib/processing/model";
import type { CutPart } from "@/lib/processing/types";
import { putFile } from "./storage";

const { packageDocuments } = schema;

/**
 * Which parts belong to one document of the package. A part without `documentId` means "the document of this
 * form" — only meaningful when the package has exactly one, otherwise it would silently cut all of them.
 */
export function partsForDocument(parts: CutPart[], templateId: string | undefined, documentCount: number): CutPart[] {
  return parts.filter((p) => (p.documentId ? p.documentId === templateId : documentCount === 1));
}

/** The file name a part is stored under; the part's name is what the admin typed. */
const partFileName = (title: string, part: CutPart) => `${part.name?.trim() || "חלק"} - ${title}.pdf`;

export interface CutResult {
  created: number;
  failed: { part: string; error: string }[];
}

/**
 * Creates the child rows for one document. Replaces any parts that document already has, so re-finalizing
 * with `force` rebuilds them from the new PDF instead of leaving stale copies behind.
 *
 * Never throws: a part that cannot be cut is reported and the rest carry on, exactly like the Drive archive —
 * the signed document itself is already stored, and nothing about the signing flow should fail over a part.
 */
export async function cutDocumentParts(opts: {
  requestId: string;
  parentDocumentId: string;
  templateVersionId: string;
  order: number;
  title: string;
  base: Uint8Array;
  parts: CutPart[];
}): Promise<CutResult> {
  const { requestId, parentDocumentId, templateVersionId, order, title, base, parts } = opts;
  const result: CutResult = { created: 0, failed: [] };
  if (!parts.length) return result;

  await db.delete(packageDocuments).where(and(eq(packageDocuments.parentDocumentId, parentDocumentId), isNotNull(packageDocuments.parentDocumentId)));

  for (const part of parts) {
    try {
      const bytes = await cutPages(base, part.pages);
      const file = await putFile({ name: partFileName(title, part), mime: "application/pdf", bytes });
      await db.insert(packageDocuments).values({
        requestId,
        templateVersionId,
        order,
        parentDocumentId,
        pages: part.pages,
        partName: part.name?.trim() || "חלק",
        typeId: part.typeId ?? null,
        finalFileId: file.id,
        finalSha256: file.sha256,
        generatedAt: new Date(),
        status: "completed",
      });
      result.created++;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      result.failed.push({ part: part.name || part.pages, error });
      console.error("cut part failed", { requestId, parentDocumentId, part: part.name, error });
    }
  }
  return result;
}

/** The parts a package defines, read safely from whatever is stored in its `processing` column. */
export const partsOfPackage = (processing: unknown): CutPart[] => normalizeProcessing(processing).parts;
