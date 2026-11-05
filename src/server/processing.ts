/**
 * Which parts of "עיבוד טופס" belong to which document of the package. The cutting itself happens on the
 * way out, in `src/server/deliver.ts`: a part is a file a destination sends, never a document of the request.
 */
import { normalizeProcessing } from "@/lib/processing/model";
import type { CutPart } from "@/lib/processing/types";

/**
 * Which parts belong to one document of the package. A part without `documentId` means "the document of this
 * form" — only meaningful when the package has exactly one, otherwise it would silently cut all of them.
 */
export function partsForDocument(parts: CutPart[], templateId: string | undefined, documentCount: number): CutPart[] {
  return parts.filter((p) => (p.documentId ? p.documentId === templateId : documentCount === 1));
}

/** The parts a package defines, read safely from whatever is stored in its `processing` column. */
export const partsOfPackage = (processing: unknown): CutPart[] => normalizeProcessing(processing).parts;
